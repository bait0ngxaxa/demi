import "server-only";

import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { resolveActorAccessByUserId, type ActorContextUserIdStore } from "@/modules/auth/services/actor-context-service";
import { getLiveExactSession } from "@/modules/auth/services/exact-session-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hasOwnPatientAppointmentIdentity } from "@/modules/patient-self/services/patient-self-query-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { verifyMiniAppWorkflowIdToken, type VerifiedMiniAppWorkflowIdentity } from "../adapters/line-login-client";
import { lineChannelTupleKey, type LineChannelInventory } from "../domain/line-authorization-lifecycle";
import type { LineWorkflowIntent } from "../domain/line-navigation-intents";
import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import { requireLineDisconnectionReadiness } from "./line-disconnection-configuration";
import { createLineSubjectFingerprint } from "./line-identity-fingerprint";
import { getLineMiniAppConfiguration, type LineMiniAppConfiguration } from "./line-mini-app-configuration";
import {
  getLineWorkflowContextKeyring,
  lineWorkflowContextSessionMatches,
  openLineWorkflowContext,
  type LineWorkflowContextKeyring,
} from "./line-workflow-context";
import { createLineWorkflowRateLimiter, type LineWorkflowRateLimiter } from "./line-workflow-rate-limit";

type LiveSession = { userId: string; sessionId: string };

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
 * be a non-excluded entry of the active reviewed inventory, so Unlink records
 * its obligation. Missing/staged lifecycle configuration fails closed.
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
  const channel = inventory?.channels.find((entry) => entry.kind === "MINI" &&
    entry.channelId === configuration.channelId && entry.environment === configuration.environment &&
    entry.deploymentReference === configuration.deploymentReference && !entry.exclusionReference);
  if (!channel) throw new LineWorkflowFailure("LIFECYCLE_UNAVAILABLE");
  return lineChannelTupleKey(channel);
}

async function requireLiveSession(dependencies: LineWorkflowDependencies): Promise<LiveSession> {
  try {
    const session = await (dependencies.liveSession ?? getLiveExactSession)();
    return { userId: session.userId, sessionId: session.sessionId };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) throw new LineWorkflowFailure("LOGIN_REQUIRED");
    if (error instanceof ForbiddenError) throw new LineWorkflowFailure("WORKFLOW_INELIGIBLE");
    throw new LineWorkflowFailure("SESSION_UNAVAILABLE");
  }
}

/** Canonical ACTIVE actor plus minimized persisted Patient SELF identity; no Patient projection. */
async function requirePatientSelfActor(userId: string, dependencies: LineWorkflowDependencies): Promise<ActorContext> {
  try {
    const access = await resolveActorAccessByUserId(userId, dependencies.actorStore);
    if (access.status !== "AUTHORIZED") throw new LineWorkflowFailure("WORKFLOW_INELIGIBLE");
    if (!(await hasOwnPatientAppointmentIdentity(access.actor, databaseOf(dependencies)))) {
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
  await requirePatientSelfActor(session.userId, dependencies);

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

/**
 * Validation primitive for future scoped requests: authenticated context, live
 * exact session, current ACTIVE binding generation, lifecycle tuple and SELF.
 * Not wired to any route in B1; B2 adds the in-transaction recheck/locks.
 */
export async function checkLineWorkflowContext(
  value: string,
  dependencies: LineWorkflowDependencies = {},
): Promise<{ userId: string; bindingId: string; bindingVersion: number; actor: ActorContext }> {
  const configuration = configurationOf(dependencies);
  const keyring = (dependencies.keyring ?? getLineWorkflowContextKeyring)();
  const context = openLineWorkflowContext(value, { keyring, tuple: configuration, now: dependencies.now?.() ?? new Date() });
  await requireMiniLifecycleTuple(configuration, dependencies);
  const session = await requireLiveSession(dependencies);
  if (session.userId !== context.userId || !lineWorkflowContextSessionMatches(context, session.sessionId, keyring)) {
    throw new LineWorkflowFailure("SCOPE_SESSION_MISMATCH");
  }
  let binding: { userId: string; lineUserId: string | null; unlinkedAt: Date | null; lifecycleVersion: number } | null;
  try {
    binding = await databaseOf(dependencies).lineAccountBinding.findUnique({
      where: { id: context.bindingId },
      select: { userId: true, lineUserId: true, unlinkedAt: true, lifecycleVersion: true },
    });
  } catch {
    throw new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE");
  }
  if (!binding || binding.userId !== context.userId || binding.unlinkedAt !== null ||
      binding.lineUserId === null || binding.lifecycleVersion !== context.bindingVersion) {
    throw new LineWorkflowFailure("SCOPE_REVOKED");
  }
  const actor = await requirePatientSelfActor(context.userId, dependencies);
  return { userId: context.userId, bindingId: context.bindingId, bindingVersion: context.bindingVersion, actor };
}
