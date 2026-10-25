import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { isRetryableSerializableTransactionError, runSerializableTransaction } from "@/lib/db/serializable-transaction";
import {
  acknowledgeOwnPatientAppointment,
  requestOwnPatientAppointmentCancellation,
  type AppointmentAcknowledgementResult,
  type AppointmentCancellationRequestResult,
  type AppointmentInteractionPrecondition,
  type AppointmentServiceDependencies,
  type PatientSelfAppointmentInteractionDependencies,
} from "@/modules/appointments/services/appointment-service";
import {
  createActorContextStore,
  resolveActorAccessByUserId,
  type ActorContextUserIdStore,
} from "@/modules/auth/services/actor-context-service";
import { getLiveExactSession } from "@/modules/auth/services/exact-session-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hasOwnPatientAppointmentIdentity } from "@/modules/patient-self/services/patient-self-query-service";
import { ApplicationError, ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { verifyMiniAppWorkflowIdToken, type VerifiedMiniAppWorkflowIdentity } from "../adapters/line-login-client";
import { lineChannelTupleKey, type LineChannelInventory } from "../domain/line-authorization-lifecycle";
import type { LineWorkflowIntent } from "../domain/line-navigation-intents";
import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import { observeLineAuthorization } from "./line-authorization-lifecycle-service";
import { requireLineDisconnectionReadiness } from "./line-disconnection-configuration";
import { createLineSubjectFingerprint } from "./line-identity-fingerprint";
import { getLineMiniAppConfiguration, type LineMiniAppConfiguration } from "./line-mini-app-configuration";
import {
  getLineWorkflowContextKeyring,
  lineWorkflowContextSessionMatches,
  lineWorkflowContextExpiry,
  openLineWorkflowContext,
  sealLineWorkflowContext,
  type LineWorkflowContextKeyring,
  type OpenedLineWorkflowContext,
} from "./line-workflow-context";
import { createLineWorkflowRateLimiter, type LineWorkflowRateLimiter } from "./line-workflow-rate-limit";

type LiveSession = { userId: string; sessionId: string; authSubject: string };

export type LineWorkflowDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  /** Defaults to the configured MINI provider channel and keyring. */
  configuration?: () => LineMiniAppConfiguration;
  /** Server-derived Full Disconnection inventory with migration readiness. */
  lifecycleInventory?: () => Promise<LineChannelInventory>;
  liveSession?: () => Promise<LiveSession>;
  verifyIdentity?: (idToken: string, configuration: LineMiniAppConfiguration) => Promise<VerifiedMiniAppWorkflowIdentity>;
  rateLimiter?: LineWorkflowRateLimiter;
  actorStore?: ActorContextUserIdStore;
  keyring?: () => LineWorkflowContextKeyring;
};

/** Internal result only. B1 never serializes this to a caller or a cookie. */
export type LineWorkflowEligibility = {
  intent: LineWorkflowIntent;
  userId: string;
  sessionId: string;
  authSubject: string;
  verifiedLineSubject: string;
  bindingId: string;
  bindingVersion: number;
  proofVerifiedAt: Date;
  proofExpiresAt: Date;
  miniTupleKey: string;
};

function databaseOf(dependencies: LineWorkflowDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function rateLimiterOf(dependencies: LineWorkflowDependencies): LineWorkflowRateLimiter {
  return dependencies.rateLimiter ?? createLineWorkflowRateLimiter(databaseOf(dependencies));
}

function configurationOf(dependencies: LineWorkflowDependencies): LineMiniAppConfiguration {
  return (dependencies.configuration ?? getLineMiniAppConfiguration)();
}

/**
 * Account-only termination is not MINI termination: the selected MINI channel
 * must be the inventory's single MINI entry so Unlink records its obligation.
 * Same-Provider placement is not asserted by configuration; it is enforced by
 * requiring the MINI-audience LINE subject to equal the binding's Account
 * subject (LINE user IDs are Provider-scoped). Missing/ambiguous configuration
 * or unavailable migration readiness fails closed.
 */
async function requireMiniLifecycleTuple(
  configuration: LineMiniAppConfiguration,
  dependencies: LineWorkflowDependencies,
): Promise<{ tupleKey: string; inventory: LineChannelInventory }> {
  let inventory: LineChannelInventory;
  try {
    inventory = await (dependencies.lifecycleInventory ?? requireLineDisconnectionReadiness)();
  } catch {
    throw new LineWorkflowFailure("LIFECYCLE_UNAVAILABLE");
  }
  const minis = inventory.channels.filter((entry) => entry.kind === "MINI");
  if (minis.length !== 1 || minis[0].channelId !== configuration.channelId ||
      minis[0].environment !== configuration.environment) {
    throw new LineWorkflowFailure("LIFECYCLE_UNAVAILABLE");
  }
  return { tupleKey: lineChannelTupleKey(minis[0]), inventory };
}

async function requireLiveSession(dependencies: LineWorkflowDependencies): Promise<LiveSession> {
  try {
    const session = await (dependencies.liveSession ?? getLiveExactSession)();
    return { userId: session.userId, sessionId: session.sessionId, authSubject: session.authSubject };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) throw new LineWorkflowFailure("LOGIN_REQUIRED");
    if (error instanceof ForbiddenError) throw new LineWorkflowFailure("WORKFLOW_INELIGIBLE");
    throw new LineWorkflowFailure("SESSION_UNAVAILABLE");
  }
}

/** Canonical ACTIVE actor plus minimized persisted Patient SELF identity; no Patient projection. */
async function requirePatientSelfActor(
  userId: string,
  store: ActorContextUserIdStore | undefined,
  database: PrismaClient | Prisma.TransactionClient,
): Promise<ActorContext> {
  try {
    const access = await resolveActorAccessByUserId(userId, store);
    if (access.status !== "AUTHORIZED") throw new LineWorkflowFailure("WORKFLOW_INELIGIBLE");
    if (!(await hasOwnPatientAppointmentIdentity(access.actor, database))) {
      throw new LineWorkflowFailure("WORKFLOW_INELIGIBLE");
    }
    return access.actor;
  } catch (error: unknown) {
    if (error instanceof LineWorkflowFailure) throw error;
    throw new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE");
  }
}

/**
 * Verifies the exact DEMI session before using its canonical User ID for the
 * shared per-user limiter. Both that quota and the global backstop run before
 * LINE Provider I/O. It then composes the server MINI tuple, MINI-audience LINE
 * proof, exactly one ACTIVE binding, exact binding-User/session-User equality,
 * ACTIVE canonical actor and Patient SELF. A binding never creates a DEMI
 * session or Patient authority.
 */
export async function evaluateLineWorkflowEligibility(
  input: { intent: LineWorkflowIntent; idToken: string },
  dependencies: LineWorkflowDependencies = {},
): Promise<LineWorkflowEligibility> {
  const configuration = configurationOf(dependencies);
  const session = await requireLiveSession(dependencies);
  const rateLimitAt = dependencies.now?.() ?? new Date();
  const rateLimiter = rateLimiterOf(dependencies);
  if (!await rateLimiter.consume("VERIFY_USER", session.userId, rateLimitAt)) {
    throw new LineWorkflowFailure("RATE_LIMITED");
  }
  if (!await rateLimiter.consume("VERIFY_GLOBAL", "GLOBAL", rateLimitAt)) {
    throw new LineWorkflowFailure("RATE_LIMITED");
  }

  const lifecycle = await requireMiniLifecycleTuple(configuration, dependencies);
  const identity = await (dependencies.verifyIdentity ?? verifyMiniAppWorkflowIdToken)(input.idToken, configuration);
  const proofCheckedAt = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(proofCheckedAt.getTime()) ||
      !Number.isFinite(identity.verifiedAt.getTime()) || identity.verifiedAt > proofCheckedAt ||
      !Number.isFinite(identity.expiresAt.getTime()) || identity.expiresAt <= proofCheckedAt) {
    throw new LineWorkflowFailure("LINE_IDENTITY_INVALID");
  }

  let bindings: Array<{ id: string; userId: string; lineUserId: string | null; lifecycleVersion: number }>;
  try {
    const { fingerprint, keyId } = createLineSubjectFingerprint(identity.subject);
    bindings = await databaseOf(dependencies).lineAccountBinding.findMany({
      where: { lineSubjectFingerprint: fingerprint, lineSubjectFingerprintKeyId: keyId, unlinkedAt: null },
      select: { id: true, userId: true, lineUserId: true, lifecycleVersion: true },
      orderBy: { id: "asc" },
      take: 2,
    });
  } catch {
    throw new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE");
  }
  if (bindings.length === 0) throw new LineWorkflowFailure("LINE_NOT_LINKED");
  const [binding] = bindings;
  // Never choose the first of several rows or fall back to retained history.
  if (bindings.length !== 1 || binding.lineUserId !== identity.subject) {
    throw new LineWorkflowFailure("BINDING_INCONSISTENT");
  }
  if (binding.userId !== session.userId) throw new LineWorkflowFailure("ACCOUNT_MISMATCH");
  await requirePatientSelfActor(session.userId, dependencies.actorStore, databaseOf(dependencies));

  return {
    intent: input.intent,
    userId: session.userId,
    sessionId: session.sessionId,
    authSubject: session.authSubject,
    verifiedLineSubject: identity.subject,
    bindingId: binding.id,
    bindingVersion: binding.lifecycleVersion,
    proofVerifiedAt: identity.verifiedAt,
    proofExpiresAt: identity.expiresAt,
    miniTupleKey: lifecycle.tupleKey,
  };
}

export const LINE_WORKFLOW_SCOPE_ISSUANCE_TRANSACTION = { timeout: 5_000 } as const;

/**
 * The initial eligibility result is only a precheck. This final gate serializes
 * MINI observation with Full Disconnection: User, binding, then the lifecycle
 * rows in their existing tuple/id order. LINE/Auth network work happens before
 * this callback; scope encryption and cookie delivery happen after commit.
 */
export async function issueLineWorkflowContext(
  eligibility: LineWorkflowEligibility,
  dependencies: LineWorkflowDependencies = {},
): Promise<{ value: string; expiresAt: Date }> {
  const configuration = configurationOf(dependencies);
  const lifecycle = await requireMiniLifecycleTuple(configuration, dependencies);
  if (lifecycle.tupleKey !== eligibility.miniTupleKey) throw new LineWorkflowFailure("LIFECYCLE_UNAVAILABLE");

  const keyring = (dependencies.keyring ?? getLineWorkflowContextKeyring)();
  if (!keyring.keys.has(keyring.currentKid)) throw new LineWorkflowFailure("MINI_CONFIGURATION_UNAVAILABLE");
  const live = await requireLiveSession(dependencies);
  if (live.userId !== eligibility.userId || live.sessionId !== eligibility.sessionId ||
      live.authSubject !== eligibility.authSubject) {
    throw new LineWorkflowFailure("SCOPE_SESSION_MISMATCH");
  }

  const database = databaseOf(dependencies);
  const fingerprint = createLineSubjectFingerprint(eligibility.verifiedLineSubject);
  const clock = dependencies.now ?? ((): Date => new Date());
  await runSerializableTransaction(database, async (transaction) => {
    const now = clock();
    const issuedAt = Math.floor(now.getTime() / 1000);
    const proofExpiresAt = Math.floor(eligibility.proofExpiresAt.getTime() / 1000);
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(eligibility.proofVerifiedAt.getTime()) ||
        eligibility.proofVerifiedAt > now || eligibility.proofExpiresAt <= now ||
        lineWorkflowContextExpiry(issuedAt, proofExpiresAt) <= issuedAt) {
      throw new LineWorkflowFailure("LINE_IDENTITY_INVALID");
    }

    await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${eligibility.userId}::uuid FOR UPDATE`;
    await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${eligibility.bindingId}::uuid FOR UPDATE`;
    const binding = await transaction.lineAccountBinding.findUnique({
      where: { id: eligibility.bindingId },
      select: {
        id: true, userId: true, lineUserId: true, lineSubjectFingerprint: true,
        lineSubjectFingerprintKeyId: true, unlinkedAt: true, lifecycleVersion: true,
      },
    });
    if (!binding || binding.userId !== eligibility.userId || binding.unlinkedAt !== null ||
        binding.lifecycleVersion !== eligibility.bindingVersion ||
        binding.lineUserId !== eligibility.verifiedLineSubject ||
        binding.lineSubjectFingerprint !== fingerprint.fingerprint ||
        binding.lineSubjectFingerprintKeyId !== fingerprint.keyId) {
      throw new LineWorkflowFailure("WORKFLOW_INELIGIBLE");
    }

    const mapping = await transaction.user.findFirst({
      where: { id: eligibility.userId, authSubject: eligibility.authSubject },
      select: { id: true },
    });
    if (!mapping) throw new LineWorkflowFailure("SCOPE_SESSION_MISMATCH");
    await requirePatientSelfActor(eligibility.userId, createActorContextStore(transaction), transaction);

    await observeLineAuthorization(transaction, {
      ownerUserId: eligibility.userId,
      bindingId: eligibility.bindingId,
      bindingVersion: eligibility.bindingVersion,
    }, lifecycle.inventory, eligibility.miniTupleKey, now);
  }, undefined, LINE_WORKFLOW_SCOPE_ISSUANCE_TRANSACTION);

  return sealLineWorkflowContext({
    bindingId: eligibility.bindingId,
    bindingVersion: eligibility.bindingVersion,
    userId: eligibility.userId,
    sessionId: eligibility.sessionId,
    proofExpiresAt: eligibility.proofExpiresAt,
  }, { keyring, tuple: configuration, now: clock() });
}

/** The only authority a scoped reader receives: one guarded snapshot, never a client or session. */
export type LineWorkflowScopedSnapshot = {
  actor: ActorContext;
  database: Prisma.TransactionClient;
};

export type LineWorkflowScopedReadDependencies = Pick<
  LineWorkflowDependencies,
  "database" | "now" | "configuration" | "lifecycleInventory" | "liveSession" | "keyring" | "rateLimiter"
>;

/** Approved 17J.3B section 12.3 bounds; no network work runs under this transaction. */
export const LINE_WORKFLOW_SCOPED_READ_TRANSACTION = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 2_000,
  timeout: 5_000,
} as const;

type OpenedLineWorkflowScope = { context: OpenedLineWorkflowContext; session: LiveSession; clock: () => Date };

/**
 * Checks shared by every scoped request, all outside any transaction: the
 * MINI provider configuration, the keyring, the
 * mandatory context (absence denies, never downgrades to ordinary DEMI
 * authority), the derived lifecycle tuple and the Auth-provider exact session.
 */
async function openLineWorkflowScope(
  credential: string | undefined,
  dependencies: LineWorkflowScopedReadDependencies,
): Promise<OpenedLineWorkflowScope> {
  const configuration = configurationOf(dependencies);
  const keyring = (dependencies.keyring ?? getLineWorkflowContextKeyring)();
  const clock = dependencies.now ?? ((): Date => new Date());
  if (!credential) throw new LineWorkflowFailure("SCOPE_MISSING");
  const context = openLineWorkflowContext(credential, { keyring, tuple: configuration, now: clock() });
  await requireMiniLifecycleTuple(configuration, dependencies);
  const session = await requireLiveSession(dependencies);
  if (session.userId !== context.userId || !lineWorkflowContextSessionMatches(context, session.sessionId, keyring)) {
    throw new LineWorkflowFailure("SCOPE_SESSION_MISMATCH");
  }
  return { context, session, clock };
}

/**
 * Current persisted authority on the caller's transaction: absolute expiry,
 * exact binding generation, verified session-to-User mapping, canonical ACTIVE
 * non-quarantined actor and persisted Patient SELF. Serializable conflicts
 * propagate unchanged so the caller's bounded retry reruns every check.
 */
async function requireScopedAuthority(
  transaction: Prisma.TransactionClient,
  { context, session, clock }: OpenedLineWorkflowScope,
): Promise<ActorContext> {
  // Server time after any pool or lock wait; nothing renews the absolute expiry.
  if (clock().getTime() >= context.expiresAt * 1000) throw new LineWorkflowFailure("SCOPE_EXPIRED");
  let binding: { userId: string; lineUserId: string | null; unlinkedAt: Date | null; lifecycleVersion: number } | null;
  let mapped: { id: string } | null;
  try {
    binding = await transaction.lineAccountBinding.findUnique({
      where: { id: context.bindingId },
      select: { userId: true, lineUserId: true, unlinkedAt: true, lifecycleVersion: true },
    });
    mapped = await transaction.user.findFirst({
      where: { id: context.userId, authSubject: session.authSubject },
      select: { id: true },
    });
  } catch (error: unknown) {
    if (isRetryableSerializableTransactionError(error)) throw error;
    throw new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE");
  }
  if (!binding || binding.userId !== context.userId || binding.unlinkedAt !== null ||
      binding.lineUserId === null || binding.lifecycleVersion !== context.bindingVersion) {
    throw new LineWorkflowFailure("SCOPE_REVOKED");
  }
  if (!mapped) throw new LineWorkflowFailure("SCOPE_SESSION_MISMATCH");
  return requirePatientSelfActor(context.userId, createActorContextStore(transaction), transaction);
}

function toScopedFailure(error: unknown): unknown {
  if (error instanceof LineWorkflowFailure || error instanceof ApplicationError) return error;
  // Transaction timeout/conflict/connection failures never become partial, empty or successful data.
  return new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE");
}

/**
 * Mandatory scoped-read boundary (17J.3B section 12.3). After the shared
 * out-of-transaction checks, one short RepeatableRead snapshot revalidates
 * current authority before the reader runs existing domain queries on that
 * same TransactionClient.
 */
export async function runLineWorkflowScopedRead<T>(
  credential: string | undefined,
  read: (snapshot: LineWorkflowScopedSnapshot) => Promise<T>,
  dependencies: LineWorkflowScopedReadDependencies = {},
): Promise<T> {
  const scope = await openLineWorkflowScope(credential, dependencies);
  try {
    return await databaseOf(dependencies).$transaction(async (transaction) => {
      const actor = await requireScopedAuthority(transaction, scope);
      return read({ actor, database: transaction });
    }, LINE_WORKFLOW_SCOPED_READ_TRANSACTION);
  } catch (error: unknown) {
    throw toScopedFailure(error);
  }
}

/** The two fixed scoped interactions; there is no generic command. */
export type LineWorkflowScopedInteraction = "ACKNOWLEDGE" | "CANCELLATION_REQUEST";

export type LineWorkflowScopedInteractionResult = {
  ACKNOWLEDGE: AppointmentAcknowledgementResult;
  CANCELLATION_REQUEST: AppointmentCancellationRequestResult;
};

export type LineWorkflowScopedMutationDependencies = LineWorkflowScopedReadDependencies &
  Pick<AppointmentServiceDependencies, "transactionRetries">;

type ScopedInteractionService<T> = (
  actor: ActorContext,
  input: unknown,
  dependencies: PatientSelfAppointmentInteractionDependencies,
) => Promise<T>;

const scopedInteractionServices: { [K in LineWorkflowScopedInteraction]: ScopedInteractionService<LineWorkflowScopedInteractionResult[K]> } = {
  ACKNOWLEDGE: acknowledgeOwnPatientAppointment,
  CANCELLATION_REQUEST: requestOwnPatientAppointmentCancellation,
};

/**
 * Mandatory scoped-mutation boundary (17J.3B section 12.4). The interaction is
 * a finite key mapped here to an existing Patient SELF service, and this
 * runner itself supplies the trusted precondition, so a scoped caller can
 * neither reach another entry point nor omit the guard. Every Serializable
 * attempt first locks User, then the authenticated binding, FOR UPDATE (held
 * through commit; never User after binding), then revalidates current
 * authority before any domain read, idempotent return or write. No
 * Provider/Auth call, cookie write or other external effect runs in the
 * callback. A denial is reported as itself, never as an idempotent success or
 * an ordinary Patient SELF outcome.
 */
export async function runLineWorkflowScopedInteraction<K extends LineWorkflowScopedInteraction>(
  credential: string | undefined,
  interaction: K,
  input: unknown,
  dependencies: LineWorkflowScopedMutationDependencies = {},
): Promise<LineWorkflowScopedInteractionResult[K]> {
  const scope = await openLineWorkflowScope(credential, dependencies);
  const rateCategory = interaction === "ACKNOWLEDGE" ? "ACKNOWLEDGE" : "CANCELLATION_REQUEST";
  if (!await rateLimiterOf(dependencies).consume(rateCategory, scope.context.userId, scope.clock())) {
    throw new LineWorkflowFailure("RATE_LIMITED");
  }
  const database = databaseOf(dependencies);
  // Early unlocked eligibility; the precondition repeats every check under the locks.
  const actor = await requirePatientSelfActor(scope.context.userId, createActorContextStore(database), database);
  let denial: LineWorkflowFailure | null = null;
  const beforeInteractionInTransaction: AppointmentInteractionPrecondition = async (transaction, interactionActor) => {
    denial = null;
    try {
      if (interactionActor.userId !== scope.context.userId) throw new LineWorkflowFailure("SCOPE_SESSION_MISMATCH");
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${scope.context.userId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${scope.context.bindingId}::uuid FOR UPDATE`;
      await requireScopedAuthority(transaction, scope);
    } catch (error: unknown) {
      if (error instanceof LineWorkflowFailure) denial = error;
      throw error;
    }
  };
  try {
    return await scopedInteractionServices[interaction](actor, input, {
      database,
      now: dependencies.now,
      transactionRetries: dependencies.transactionRetries,
      beforeInteractionInTransaction,
    });
  } catch (error: unknown) {
    // The Appointment service normalizes foreign errors; the last attempt's denial is authoritative.
    throw toScopedFailure(denial ?? error);
  }
}
