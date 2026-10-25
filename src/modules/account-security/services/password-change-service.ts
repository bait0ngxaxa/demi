import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { WorkforceActivationOperationState, type Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { AuditEventInput } from "@/modules/audit/schemas/audit-schemas";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createAuthAttemptThrottle, type AuthAttemptThrottle } from "@/modules/auth/services/auth-attempt-throttle-service";
import {
  unreconciledAccountRecoveryWhere,
  unreconciledLinePasswordRecoveryWhere,
  unreconciledWorkforceResetWhere,
} from "@/modules/auth/services/credential-recovery-state";
import { lockCredentialOperation } from "@/modules/identity/services/first-credential-serialization";
import { notifyPasswordChangeLineBindings } from "./password-change-notification";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { authenticatedPasswordChangeSchema } from "../schemas/account-security-schemas";
import {
  CurrentPasswordRejectedError,
  PasswordChangeProviderNotStartedError,
  PasswordChangeProviderRejectedError,
  updateAuthenticatedPassword,
} from "../adapters/supabase-account-security-provider";

export type AuthenticatedPasswordChangeProvider = (input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  /** Epoch ms after which the provider must not send, and must abort, the password update. */
  deadline: number;
  signal: AbortSignal;
}) => Promise<{ otherSessionsRevoked: boolean } | void>;

/** Hard bound on the provider request, enforced by the provider adapter. */
export const PASSWORD_CHANGE_PROVIDER_DEADLINE_MS = 60 * 1000;
/** The lease spans fence reservation, the provider request and the fence resolution. */
const PASSWORD_CHANGE_LEASE_TIMEOUT_MS = PASSWORD_CHANGE_PROVIDER_DEADLINE_MS + 60 * 1000;

export type PasswordChangeAuditWriter = (input: AuditEventInput) => Promise<void>;

export type PasswordChangeDependencies = {
  provider?: AuthenticatedPasswordChangeProvider;
  audit?: PasswordChangeAuditWriter;
  database?: PrismaClient;
  attemptThrottle?: AuthAttemptThrottle;
  clientIpAddress?: string | null;
  now?: () => Date;
  sendLineMessage?: (lineUserId: string, message: string, retryKey: string) => Promise<{ kind: string }>;
};

export class PasswordChangeAttemptThrottledError extends Error {
  constructor() {
    super("Password change attempts are temporarily blocked");
    this.name = "PasswordChangeAttemptThrottledError";
  }
}

export class PasswordChangeRecoveryPendingError extends ConflictError {
  constructor() {
    super("An account recovery operation is already in progress");
    this.name = "PasswordChangeRecoveryPendingError";
  }
}

export class PasswordChangeOutcomeUncertainError extends InfrastructureError {
  constructor() {
    super("The password change outcome requires reconciliation");
    this.name = "PasswordChangeOutcomeUncertainError";
  }
}

async function hasUnresolvedReset(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const inFlightStates = {
    in: [
      WorkforceActivationOperationState.CLAIMED,
      WorkforceActivationOperationState.PROVIDER_STARTED,
      WorkforceActivationOperationState.PROVIDER_CONFIRMED,
      WorkforceActivationOperationState.RECONCILIATION_REQUIRED,
    ],
  };
  const [workforce, patient, line] = await Promise.all([
    transaction.workforceActivation.findFirst({
      where: {
        userId,
        purpose: "RESET",
        OR: [
          { ...unreconciledWorkforceResetWhere },
          { operationState: inFlightStates },
          { reconciliationRequiredAt: { not: null } },
        ],
      },
      select: { id: true },
    }),
    transaction.accountRecovery.findFirst({
      where: {
        targetUserId: userId,
        OR: [
          { ...unreconciledAccountRecoveryWhere },
          { operationState: inFlightStates },
          { reconciliationRequiredAt: { not: null } },
        ],
      },
      select: { id: true },
    }),
    transaction.linePasswordRecoveryCapability.findFirst({
      where: {
        targetUserId: userId,
        OR: [
          { ...unreconciledLinePasswordRecoveryWhere },
          { operationState: inFlightStates },
          { reconciliationRequiredAt: { not: null } },
        ],
      },
      select: { id: true },
    }),
  ]);
  return Boolean(workforce || patient || line);
}

/** Non-blocking: a held lease means a password-change process for this User is still connected and running. */
async function tryAcquirePasswordChangeLease(transaction: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const [row] = await transaction.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${userId}), hashtext('DEMI_PASSWORD_CHANGE_LEASE')) AS acquired`;
  return row?.acquired === true;
}

/**
 * Holds a per-User lease in an open transaction while the password change runs. PostgreSQL releases it when the
 * process finishes or its connection dies, so reconciliation can tell a running request from an abandoned fence.
 * The operation's own result wins over a lease that closed early; the provider deadline still bounds the request.
 */
async function withPasswordChangeLease<T>(
  database: PrismaClient,
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  let outcome: { value: T } | { error: unknown } | undefined;
  try {
    await database.$transaction(async (lease) => {
      if (!await tryAcquirePasswordChangeLease(lease, userId)) throw new PasswordChangeRecoveryPendingError();
      try {
        outcome = { value: await operation() };
      } catch (error: unknown) {
        outcome = { error };
      }
    }, { timeout: PASSWORD_CHANGE_LEASE_TIMEOUT_MS });
  } catch (error: unknown) {
    if (!outcome) throw error;
  }
  if (!outcome) throw new InfrastructureError("Password change lease did not complete");
  if ("error" in outcome) throw outcome.error;
  return outcome.value;
}

async function beginPasswordChangeOperation(
  database: PrismaClient,
  userId: string,
  operationId: string,
  now: Date,
): Promise<void> {
  await runSerializableTransaction(database, async (transaction) => {
    await lockCredentialOperation(transaction, userId);
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { passwordChangeOperationId: true },
    });
    if (!user) throw new InfrastructureError("Account identity could not be confirmed");
    if (user.passwordChangeOperationId || await hasUnresolvedReset(transaction, userId)) {
      throw new PasswordChangeRecoveryPendingError();
    }
    const started = await transaction.user.updateMany({
      where: { id: userId, passwordChangeOperationId: null },
      data: {
        passwordChangeOperationId: operationId,
        passwordChangeStartedAt: now,
        passwordChangeReconciliationRequiredAt: null,
      },
    });
    if (started.count !== 1) throw new PasswordChangeRecoveryPendingError();
  });
}

async function clearPasswordChangeOperation(
  database: PrismaClient,
  userId: string,
  operationId: string,
): Promise<void> {
  await runSerializableTransaction(database, async (transaction) => {
    await lockCredentialOperation(transaction, userId);
    if (await hasUnresolvedReset(transaction, userId)) throw new PasswordChangeRecoveryPendingError();
    const cleared = await transaction.user.updateMany({
      where: { id: userId, passwordChangeOperationId: operationId },
      data: {
        passwordChangeOperationId: null,
        passwordChangeStartedAt: null,
        passwordChangeReconciliationRequiredAt: null,
      },
    });
    if (cleared.count !== 1) throw new PasswordChangeOutcomeUncertainError();
  });
}

async function markPasswordChangeReconciliationRequired(
  database: PrismaClient,
  userId: string,
  operationId: string,
  now: Date,
): Promise<void> {
  await runSerializableTransaction(database, async (transaction) => {
    await lockCredentialOperation(transaction, userId);
    await transaction.user.updateMany({
      where: { id: userId, passwordChangeOperationId: operationId },
      data: { passwordChangeReconciliationRequiredAt: now },
    });
  });
}

/** Earlier unclaimed links must not survive a credential the provider may already have replaced. */
async function revokeUnclaimedRecoveryCapabilities(
  transaction: Prisma.TransactionClient,
  userId: string,
  now: Date,
): Promise<{ workforce: number; patient: number; line: number }> {
  const [workforce, patient, line] = await Promise.all([
    transaction.workforceActivation.updateMany({
      where: {
        userId,
        purpose: "RESET",
        claimedAt: null,
        usedAt: null,
        revokedAt: null,
        operationState: WorkforceActivationOperationState.NOT_STARTED,
        reconciliationRequiredAt: null,
      },
      data: { revokedAt: now },
    }),
    transaction.accountRecovery.updateMany({
      where: {
        targetUserId: userId,
        claimedAt: null,
        completedAt: null,
        revokedAt: null,
        operationState: WorkforceActivationOperationState.NOT_STARTED,
        reconciliationRequiredAt: null,
      },
      data: { revokedAt: now },
    }),
    transaction.linePasswordRecoveryCapability.updateMany({
      where: {
        targetUserId: userId,
        claimedAt: null,
        completedAt: null,
        revokedAt: null,
        operationState: WorkforceActivationOperationState.NOT_STARTED,
        reconciliationRequiredAt: null,
      },
      data: { revokedAt: now },
    }),
  ]);
  return { workforce: workforce.count, patient: patient.count, line: line.count };
}

async function finalizePasswordChangeOperation(
  database: PrismaClient,
  userId: string,
  operationId: string,
  now: Date,
): Promise<void> {
  await runSerializableTransaction(database, async (transaction) => {
    await lockCredentialOperation(transaction, userId);
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { passwordChangeOperationId: true, passwordChangeReconciliationRequiredAt: true },
    });
    if (
      !user || user.passwordChangeOperationId !== operationId ||
      user.passwordChangeReconciliationRequiredAt || await hasUnresolvedReset(transaction, userId)
    ) {
      throw new PasswordChangeOutcomeUncertainError();
    }

    await revokeUnclaimedRecoveryCapabilities(transaction, userId, now);
    const cleared = await transaction.user.updateMany({
      where: { id: userId, passwordChangeOperationId: operationId, passwordChangeReconciliationRequiredAt: null },
      data: {
        passwordChangeOperationId: null,
        passwordChangeStartedAt: null,
        passwordChangeReconciliationRequiredAt: null,
      },
    });
    if (cleared.count !== 1) throw new PasswordChangeOutcomeUncertainError();
  });
}

export async function changeAuthenticatedUserPassword(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PasswordChangeDependencies = {},
): Promise<{ otherSessionsRevoked: boolean }> {
  if (!actor || !actor.userId.trim()) {
    throw new ForbiddenError();
  }

  const parsed = authenticatedPasswordChangeSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Password change data is invalid");
  }

  const updatePassword = dependencies.provider ?? updateAuthenticatedPassword;
  const database = dependencies.database ?? getPrisma();
  const user = await database.user.findUnique({
    where: { id: actor.userId },
    select: { person: { select: { identityKeyHash: true } } },
  });
  const identityHash = user?.person.identityKeyHash;
  if (!identityHash) throw new InfrastructureError("Account identity could not be confirmed");
  const attemptThrottle = dependencies.attemptThrottle ?? createAuthAttemptThrottle({ database });
  const now = dependencies.now?.() ?? new Date();
  const throttleInput = {
    scope: "PASSWORD_CHANGE" as const,
    identityHash,
    clientIp: dependencies.clientIpAddress ?? null,
    now,
  };
  if (await attemptThrottle.isBlocked(throttleInput)) throw new PasswordChangeAttemptThrottledError();

  const operationId = randomUUID();
  // Fixed before the fence exists, so the deadline never ends later than the fence start plus the bound.
  const deadline = Date.now() + PASSWORD_CHANGE_PROVIDER_DEADLINE_MS;
  const signal = AbortSignal.timeout(PASSWORD_CHANGE_PROVIDER_DEADLINE_MS);
  const providerResult = await withPasswordChangeLease(database, actor.userId, async () => {
    await beginPasswordChangeOperation(database, actor.userId, operationId, now);

    let result: { otherSessionsRevoked: boolean } | void;
    try {
      result = await updatePassword({
        userId: actor.userId,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        deadline,
        signal,
      });
    } catch (error: unknown) {
      if (
        error instanceof CurrentPasswordRejectedError ||
        error instanceof PasswordChangeProviderRejectedError ||
        error instanceof PasswordChangeProviderNotStartedError
      ) {
        try {
          await clearPasswordChangeOperation(database, actor.userId, operationId);
        } catch {
          throw new PasswordChangeOutcomeUncertainError();
        }
        if (error instanceof CurrentPasswordRejectedError) await attemptThrottle.recordFailure(throttleInput);
        throw error;
      }
      await markPasswordChangeReconciliationRequired(database, actor.userId, operationId, dependencies.now?.() ?? new Date()).catch(() => {
        console.error("Password change outcome is unknown; credential recovery remains fenced");
      });
      throw new PasswordChangeOutcomeUncertainError();
    }

    try {
      await finalizePasswordChangeOperation(database, actor.userId, operationId, dependencies.now?.() ?? new Date());
    } catch {
      await markPasswordChangeReconciliationRequired(database, actor.userId, operationId, dependencies.now?.() ?? new Date()).catch(() => {
        console.error("Password change outcome is unknown; credential recovery remains fenced");
      });
      throw new PasswordChangeOutcomeUncertainError();
    }
    return result;
  });

  const audit = dependencies.audit ?? recordAuditEvent;

  try {
    await audit({
      actorUserId: actor.userId,
      action: "ACCOUNT_PASSWORD_CHANGED",
      resourceType: "USER",
      resourceId: actor.userId,
    });
  } catch {
    // Provider success is confirmed; do not tell the User the old password still works.
    console.error("Password change succeeded but the security audit event could not be stored");
  }
  await notifyPasswordChangeLineBindings(database, actor.userId, now, dependencies.sendLineMessage);
  return { otherSessionsRevoked: providerResult?.otherSessionsRevoked ?? true };
}

/**
 * Well past the provider deadline and the lease timeout, so even a process whose lease connection dropped can no longer
 * send or hold open the update. Age is one of two conditions and never releases a fence by itself: the lease must also
 * be free, proving no connected process still owns the operation.
 */
export const PASSWORD_CHANGE_RECONCILIATION_MIN_AGE_MS = 15 * 60 * 1000;

const passwordChangeReconciliationSchema = z.object({
  userId: z.uuid(),
  operationId: z.uuid(),
  operatorNote: z.string().trim().min(5).max(256)
    .refine((note) => !/\d{13}/.test(note.replace(/[\s-]/g, "")), "The operator note must not contain a National ID"),
}).strict();

export type PasswordChangeReconciliationResult =
  | { outcome: "RELEASED"; revoked: { workforce: number; patient: number; line: number } }
  | { outcome: "ALREADY_RELEASED" }
  | { outcome: "RETAINED"; reason: "OPERATION_TOO_RECENT" | "OPERATION_IN_FLIGHT" | "RECOVERY_UNRESOLVED" };

export type PasswordChangeReconciliationDependencies = {
  database?: PrismaClient;
  now?: () => Date;
};

/** Operator view of fenced Users; internal identifiers and timestamps only. */
export async function listUnresolvedPasswordChangeOperations(
  dependencies: Pick<PasswordChangeReconciliationDependencies, "database"> = {},
): Promise<{ userId: string; operationId: string; startedAt: Date; reconciliationRequiredAt: Date | null }[]> {
  const database = dependencies.database ?? getPrisma();
  const users = await database.user.findMany({
    where: { passwordChangeOperationId: { not: null } },
    select: { id: true, passwordChangeOperationId: true, passwordChangeStartedAt: true, passwordChangeReconciliationRequiredAt: true },
    orderBy: { passwordChangeStartedAt: "asc" },
  });
  return users.flatMap((user) => user.passwordChangeOperationId && user.passwordChangeStartedAt
    ? [{
        userId: user.id,
        operationId: user.passwordChangeOperationId,
        startedAt: user.passwordChangeStartedAt,
        reconciliationRequiredAt: user.passwordChangeReconciliationRequiredAt,
      }]
    : []);
}

/**
 * Resolves one unresolved authenticated password change. The provider outcome cannot be proven either way, so the
 * operation is always reconciled as possibly changed: every earlier unclaimed capability is revoked in the same
 * transaction that releases the fence, which is the confirmed-success end state and safe for either credential. The
 * account owner can then use an existing recovery ceremony to establish a new credential. Claimed or
 * reconciliation-required resets keep the fence; their own reconciliation runs first.
 */
export async function reconcileUnresolvedPasswordChange(
  input: unknown,
  dependencies: PasswordChangeReconciliationDependencies = {},
): Promise<PasswordChangeReconciliationResult> {
  const parsed = passwordChangeReconciliationSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Password change reconciliation data is invalid");
  const { userId, operationId, operatorNote } = parsed.data;
  const database = dependencies.database ?? getPrisma();
  const now = dependencies.now?.() ?? new Date();

  return runSerializableTransaction(database, async (transaction) => {
    await lockCredentialOperation(transaction, userId);
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { passwordChangeOperationId: true, passwordChangeStartedAt: true, passwordChangeReconciliationRequiredAt: true },
    });
    if (!user) throw new NotFoundError("No User matches the password change operation");
    if (user.passwordChangeOperationId !== operationId || !user.passwordChangeStartedAt) {
      const released = await transaction.auditEvent.findFirst({
        where: {
          action: "account.password_change.reconciled",
          resourceType: "User",
          resourceId: userId,
          metadata: { path: ["operationId"], equals: operationId },
        },
        select: { id: true },
      });
      if (released) return { outcome: "ALREADY_RELEASED" };
      throw new NotFoundError("The password change operation is not outstanding for this User");
    }

    const evidence = {
      operationId,
      operationStartedAt: user.passwordChangeStartedAt.toISOString(),
      reconciliationRequiredAt: user.passwordChangeReconciliationRequiredAt?.toISOString() ?? null,
      fenceReason: user.passwordChangeReconciliationRequiredAt ? "OUTCOME_UNCERTAIN" : "PROCESS_INTERRUPTED",
      providerOutcome: "UNVERIFIED",
      procedure: "REVOKE_UNCLAIMED_AND_RELEASE",
      providerDeadlineMs: PASSWORD_CHANGE_PROVIDER_DEADLINE_MS,
      operatorNote,
    };
    const retainedReason = now.getTime() - user.passwordChangeStartedAt.getTime() < PASSWORD_CHANGE_RECONCILIATION_MIN_AGE_MS
      ? "OPERATION_TOO_RECENT" as const
      : !await tryAcquirePasswordChangeLease(transaction, userId) ? "OPERATION_IN_FLIGHT" as const
      : await hasUnresolvedReset(transaction, userId) ? "RECOVERY_UNRESOLVED" as const : null;
    if (retainedReason) {
      await recordAuditEvent({
        actorUserId: null,
        action: "account.password_change.reconciliation_retained",
        resourceType: "User",
        resourceId: userId,
        metadata: { ...evidence, outcome: "RETAINED", retainedReason },
      }, transaction);
      return { outcome: "RETAINED", reason: retainedReason };
    }

    const revoked = await revokeUnclaimedRecoveryCapabilities(transaction, userId, now);
    const cleared = await transaction.user.updateMany({
      where: { id: userId, passwordChangeOperationId: operationId },
      data: {
        passwordChangeOperationId: null,
        passwordChangeStartedAt: null,
        passwordChangeReconciliationRequiredAt: null,
      },
    });
    if (cleared.count !== 1) throw new InfrastructureError("The password change fence could not be released");
    await recordAuditEvent({
      actorUserId: null,
      action: "account.password_change.reconciled",
      resourceType: "User",
      resourceId: userId,
      metadata: {
        ...evidence,
        outcome: "RELEASED",
        processLeaseFree: true,
        revokedWorkforceResets: revoked.workforce,
        revokedPatientRecoveries: revoked.patient,
        revokedLineCapabilities: revoked.line,
      },
    }, transaction);
    return { outcome: "RELEASED", revoked };
  });
}
