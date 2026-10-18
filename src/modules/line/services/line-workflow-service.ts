import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { isRetryableSerializableTransactionError } from "@/lib/db/serializable-transaction";
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
import { requireLineDisconnectionReadiness } from "./line-disconnection-configuration";
import { createLineSubjectFingerprint } from "./line-identity-fingerprint";
import {
  getLineMiniAppConfiguration,
  isLineMiniAppWorkflowEnabled,
  type LineMiniAppConfiguration,
} from "./line-mini-app-configuration";
import {
  getLineWorkflowContextKeyring,
  lineWorkflowContextSessionMatches,
  openLineWorkflowContext,
  type LineWorkflowContextKeyring,
  type OpenedLineWorkflowContext,
} from "./line-workflow-context";
import { createLineWorkflowRateLimiter, type LineWorkflowRateLimiter } from "./line-workflow-rate-limit";

type LiveSession = { userId: string; sessionId: string; authSubject: string };

export type LineWorkflowDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  configuration?: () => LineMiniAppConfiguration;
  /** Reviewed Full Disconnection inventory; null means the lifecycle bundle is not active. */
  lifecycleInventory?: () => Promise<LineChannelInventory | null>;
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
  bindingId: string;
  bindingVersion: number;
  proofExpiresAt: Date;
  miniTupleKey: string;
};

const processRateLimiter = createLineWorkflowRateLimiter();

function databaseOf(dependencies: LineWorkflowDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function configurationOf(dependencies: LineWorkflowDependencies): LineMiniAppConfiguration {
  return (dependencies.configuration ?? getLineMiniAppConfiguration)();
}

async function defaultLifecycleInventory(): Promise<LineChannelInventory | null> {
  return (await requireLineDisconnectionReadiness())?.inventory ?? null;
}

/**
 * Account-only termination is not MINI termination: the selected MINI tuple must
 * be the single non-excluded MINI entry of the active reviewed inventory, paired
 * with the same Provider reference as the inventory's sole expected Account
 * tuple, so Unlink records its obligation. The inventory is the operator
 * manifest, never request input. Missing/staged/ambiguous configuration fails closed.
 */
async function requireMiniLifecycleTuple(
  configuration: LineMiniAppConfiguration,
  dependencies: LineWorkflowDependencies,
): Promise<string> {
  let inventory: LineChannelInventory | null;
  try {
    inventory = await (dependencies.lifecycleInventory ?? defaultLifecycleInventory)();
  } catch {
    throw new LineWorkflowFailure("LIFECYCLE_UNAVAILABLE");
  }
  const accounts = inventory?.channels.filter((entry) => entry.kind === "ACCOUNT") ?? [];
  const minis = inventory?.channels.filter((entry) => entry.kind === "MINI" &&
    entry.channelId === configuration.channelId && entry.environment === configuration.environment &&
    entry.deploymentReference === configuration.deploymentReference) ?? [];
  const expectedAccountChannelId = process.env.DEMI_LINE_LOGIN_CHANNEL_ID?.trim();
  // Never pick one of several candidates; an excluded or cross-Provider tuple denies.
  if (!inventory || inventory.miniExclusionReference || accounts.length !== 1 || minis.length !== 1 ||
      !expectedAccountChannelId || accounts[0].channelId !== expectedAccountChannelId ||
      minis[0].exclusionReference || minis[0].providerReference !== accounts[0].providerReference) {
    throw new LineWorkflowFailure("LIFECYCLE_UNAVAILABLE");
  }
  return lineChannelTupleKey(minis[0]);
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
 * Composes server MINI tuple, live exact DEMI session, local abuse control,
 * MINI-audience LINE proof, exactly one current ACTIVE binding, exact
 * binding-User/session-User equality, ACTIVE canonical actor and Patient SELF.
 * A binding never creates a DEMI session or Patient authority.
 */
export async function evaluateLineWorkflowEligibility(
  input: { intent: LineWorkflowIntent; idToken: string },
  dependencies: LineWorkflowDependencies = {},
): Promise<LineWorkflowEligibility> {
  const configuration = configurationOf(dependencies);
  const miniTupleKey = await requireMiniLifecycleTuple(configuration, dependencies);
  const session = await requireLiveSession(dependencies);
  const now = dependencies.now?.() ?? new Date();
  if (!(dependencies.rateLimiter ?? processRateLimiter).consume(session.userId, now)) {
    throw new LineWorkflowFailure("RATE_LIMITED");
  }
  const identity = await (dependencies.verifyIdentity ?? verifyMiniAppWorkflowIdToken)(input.idToken, configuration);

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
    bindingId: binding.id,
    bindingVersion: binding.lifecycleVersion,
    proofExpiresAt: identity.expiresAt,
    miniTupleKey,
  };
}

/** The only authority a scoped reader receives: one guarded snapshot, never a client or session. */
export type LineWorkflowScopedSnapshot = {
  actor: ActorContext;
  database: Prisma.TransactionClient;
};

export type LineWorkflowScopedReadDependencies = Pick<
  LineWorkflowDependencies,
  "database" | "now" | "configuration" | "lifecycleInventory" | "liveSession" | "keyring"
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
 * default-disabled gate, the trusted tuple and keyring, the mandatory context
 * (absence denies, never downgrades to ordinary DEMI authority), the reviewed
 * lifecycle tuple and the Auth-provider exact session.
 */
async function openLineWorkflowScope(
  credential: string | undefined,
  dependencies: LineWorkflowScopedReadDependencies,
): Promise<OpenedLineWorkflowScope> {
  if (!isLineMiniAppWorkflowEnabled()) throw new LineWorkflowFailure("WORKFLOW_DISABLED");
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
