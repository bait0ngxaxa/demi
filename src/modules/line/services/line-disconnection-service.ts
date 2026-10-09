import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { LineAccountBinding, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { getLiveExactSession } from "@/modules/auth/services/exact-session-service";
import { ForbiddenError } from "@/shared/errors/application-error";
import { deauthorizeLineAccount } from "../adapters/line-deauthorization-client";
import { verifyFreshLineIdToken } from "../adapters/line-login-client";
import { isLineObligationSatisfied, isLineRecoveryEligible, lineChannelTupleKey, lineObligationStatus, lineObligationSetDigest } from "../domain/line-authorization-lifecycle";
import { LineFailure } from "../domain/line-errors";
import { lineRecoveryRequestSchema } from "../schemas/line-schemas";
import { isLineDisconnectionReadinessUnavailableAudit, unlinkLineAccount, type LineAccountDependencies } from "./line-account-service";
import { authorizeLineRecoveryDecision, isLineTerminationDispatchAllowed, prepareLineRecoverySet, recordLineTerminationOutcome, releaseLineRecovery, reserveLineTerminationAttempt } from "./line-authorization-lifecycle-service";
import type { LineDisconnectionConfiguration } from "./line-disconnection-configuration";
import { createLineSubjectFingerprint } from "./line-identity-fingerprint";
import { getCurrentLineSession, hashLineSessionId, timingSafeHashMatch } from "./line-session-service";

const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const targetOf = (binding: LineAccountBinding): { ownerUserId: string; bindingId: string; bindingVersion: number } => ({ ownerUserId: binding.userId, bindingId: binding.id, bindingVersion: binding.lifecycleVersion });

export type DisconnectionDependencies = LineAccountDependencies & {
  configuration: LineDisconnectionConfiguration;
  liveSession?: typeof getLiveExactSession;
  freshIdentity?: typeof verifyFreshLineIdToken;
  terminate?: typeof deauthorizeLineAccount;
};

export type LineDisconnectionStatus = {
  state: "NONE" | "PENDING" | "RECOVERY_REQUIRED" | "REMOTE_CONFIRMED" | "RECOVERY_RELEASED_UNVERIFIED";
  canRelink: boolean;
  obligations: Array<{ id: string; appName: string; status: ReturnType<typeof lineObligationStatus> }>;
};

function dbOf(deps: DisconnectionDependencies): PrismaClient { return deps.database ?? getPrisma(); }
function nowOf(deps: DisconnectionDependencies): Date { return deps.now?.() ?? new Date(); }

export async function getLineDisconnectionStatus(deps: DisconnectionDependencies): Promise<LineDisconnectionStatus> {
  const session = await (deps.currentSession ?? getCurrentLineSession)();
  const database = dbOf(deps);
  const owner = await database.user.findUnique({ where: { id: session.userId }, select: { status: true } });
  if (owner?.status !== "ACTIVE") throw new ForbiddenError();
  const bindings = await database.lineAccountBinding.findMany({ where: { userId: session.userId }, orderBy: { id: "asc" } });
  const rows = await database.lineAuthorizationLifecycle.findMany({ where: { bindingId: { in: bindings.map((binding) => binding.id) }, requestedAt: { not: null } }, orderBy: [{ bindingVersion: "asc" }, { tupleKey: "asc" }] });
  const blocked = rows.filter((row) => !isLineObligationSatisfied(row));
  const generations = new Set(rows.map((row) => `${row.bindingId}:${row.bindingVersion}`));
  const legacy = bindings.some((binding) => binding.unlinkedAt && !generations.has(`${binding.id}:${binding.lifecycleVersion}`));
  const state = blocked.length || legacy
    ? blocked.every((row) => isLineRecoveryEligible(row, nowOf(deps))) ? "RECOVERY_REQUIRED" : "PENDING"
    : rows.some((row) => row.recoveryReleasedAt) ? "RECOVERY_RELEASED_UNVERIFIED" : rows.length ? "REMOTE_CONFIRMED" : "NONE";
  return { state, canRelink: !legacy && blocked.length === 0,
    obligations: rows.map((row) => ({ id: row.id, appName: deps.configuration.appNames[row.tupleKey] ?? "แอป DEMI ที่เคยเชื่อมต่อ", status: lineObligationStatus(row) })) };
}

/**
 * Read-only display support for the intentionally staged rollout. A disabled
 * feature gate is only safe to present as ordinary Link/Relink when this owner
 * has no durable lifecycle history. Backend Link guards remain authoritative.
 */
export async function hasLineLifecycleHistoryForCurrentOwner(
  dependencies: Pick<DisconnectionDependencies, "database" | "currentSession"> = {},
): Promise<boolean> {
  const session = await (dependencies.currentSession ?? getCurrentLineSession)();
  const database = dependencies.database ?? getPrisma();
  const owner = await database.user.findUnique({ where: { id: session.userId }, select: { status: true } });
  if (owner?.status !== "ACTIVE") throw new ForbiddenError();

  const bindings = await database.lineAccountBinding.findMany({ where: { userId: session.userId }, select: { id: true } });
  if (!bindings.length) return false;

  const bindingIds = bindings.map((binding) => binding.id);
  if (await database.lineAuthorizationLifecycle.count({ where: { bindingId: { in: bindingIds } } })) return true;

  const unlinkAudits = await database.auditEvent.findMany({
    where: { action: "line.account.unlinked", resourceType: "LineAccountBinding", resourceId: { in: bindingIds } },
    select: { metadata: true },
  });
  return unlinkAudits.some((audit) => isLineDisconnectionReadinessUnavailableAudit(audit.metadata));
}

/** Provider failure and even post-commit persistence failure cannot undo local revocation.
 * Only the original invocation holding the returned reservation can send; no resume worker.
 */
export async function disconnectLineAccount(input: { intentId: string; challenge: string; accessToken?: string }, deps: DisconnectionDependencies): Promise<{ status: "UNLINKED"; bindingId: string; disconnection: LineDisconnectionStatus | null }> {
  const session = await (deps.currentSession ?? getCurrentLineSession)();
  const database = dbOf(deps);
  const result = await unlinkLineAccount(input, { ...deps, currentSession: async () => session, authorizationInventory: deps.configuration.inventory });
  if (input.accessToken) {
    try {
      const binding = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: result.bindingId } });
      const account = deps.configuration.inventory.channels.find((channel) => channel.kind === "ACCOUNT");
      if (!account) throw new ForbiddenError();
      const attempt = await runSerializableTransaction(database, (transaction) => reserveLineTerminationAttempt(transaction,
        { ownerUserId: session.userId, bindingId: result.bindingId, bindingVersion: result.lifecycleVersion, tupleKey: lineChannelTupleKey(account) }, deps.configuration.inventory, nowOf(deps)));
      if (attempt) {
        const evidence = binding.lineUserId ? await (deps.terminate ?? deauthorizeLineAccount)(input.accessToken, binding.lineUserId,
          () => runSerializableTransaction(database, (transaction) => isLineTerminationDispatchAllowed(transaction, attempt))) : "KNOWN_NOT_DISPATCHED";
        await runSerializableTransaction(database, (transaction) => recordLineTerminationOutcome(transaction, attempt, evidence, nowOf(deps)));
      }
    } catch {
      // A reservation survives a crash/failure conservatively. Never redispatch.
    }
  }
  let disconnection: LineDisconnectionStatus | null = null;
  try { disconnection = await getLineDisconnectionStatus({ ...deps, currentSession: async () => session }); } catch { /* refresh is explicit */ }
  return { status: "UNLINKED", bindingId: result.bindingId, disconnection };
}

export async function prepareLineAccountRecovery(deps: DisconnectionDependencies): Promise<{
  intentId: string; challenge: string; expiresAt: string; reviews: Array<{ id: string; appName: string }>;
}> {
  const live = await (deps.liveSession ?? getLiveExactSession)();
  const database = dbOf(deps);
  const now = nowOf(deps);
  const challenge = randomBytes(32).toString("base64url");
  return runSerializableTransaction(database, async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${live.userId}::uuid FOR UPDATE`;
    const candidates = await transaction.lineAccountBinding.findMany({ where: { userId: live.userId, unlinkedAt: { not: null } }, orderBy: [{ unlinkedAt: "asc" }, { id: "asc" }] });
    const history = await transaction.lineAuthorizationLifecycle.findMany({ where: { bindingId: { in: candidates.map((binding) => binding.id) }, requestedAt: { not: null } } });
    const trackedGenerations = new Set(history.map((row) => `${row.bindingId}:${row.bindingVersion}`));
    const pendingBindings = new Set(history.filter((row) => !isLineObligationSatisfied(row)).map((row) => row.bindingId));
    let selected: LineAccountBinding | undefined;
    for (const binding of candidates) {
      if (!trackedGenerations.has(`${binding.id}:${binding.lifecycleVersion}`) || pendingBindings.has(binding.id)) { selected = binding; break; }
    }
    if (!selected) throw new ForbiddenError();
    await transaction.lineAccountActionIntent.deleteMany({ where: { userId: live.userId, expiresAt: { lte: now } } });
    if (await transaction.lineAccountActionIntent.count({ where: { userId: live.userId, createdAt: { gt: new Date(now.getTime() - 300_000) } } }) >= 5) throw new LineFailure("LINE_RATE_LIMITED");
    // Persist a valid preliminary snapshot, then revalidate/update under Binding
    // locks. Legacy initialization may add rows; no NULL/placeholder Recovery intent.
    const selectedId = selected.id;
    const preview = history.filter((row) => row.bindingId === selectedId);
    const intent = await transaction.lineAccountActionIntent.create({ data: { action: "RECOVERY", userId: live.userId, challengeHash: digest(challenge),
      sessionHash: hashLineSessionId(live.sessionId), createdAt: now, expiresAt: new Date(now.getTime() + 300_000),
      targetBindingId: selected.id, targetBindingVersion: selected.lifecycleVersion,
      reviewedSetDigest: lineObligationSetDigest(preview.filter((row) => !isLineObligationSatisfied(row)), deps.configuration.inventory) } });
    await transaction.$queryRaw`SELECT "id" FROM "LineAccountActionIntent" WHERE "id" = ${intent.id}::uuid FOR UPDATE`;
    const set = await prepareLineRecoverySet(transaction, targetOf(selected), deps.configuration.inventory, now);
    await transaction.lineAccountActionIntent.update({ where: { id: intent.id }, data: {
      targetBindingId: selected.id, targetBindingVersion: selected.lifecycleVersion, reviewedSetDigest: set.reviewedSetDigest,
    } });
    const rows = await transaction.lineAuthorizationLifecycle.findMany({ where: { id: { in: set.rowIds } } });
    return { intentId: intent.id, challenge, expiresAt: intent.expiresAt.toISOString(),
      reviews: rows.map((row) => ({ id: row.id, appName: deps.configuration.appNames[row.tupleKey] ?? "แอป DEMI ที่เคยเชื่อมต่อ" })) };
  });
}

export async function recoverLineAccount(input: z.infer<typeof lineRecoveryRequestSchema>, deps: DisconnectionDependencies): Promise<{ status: "RECOVERY_RELEASED_UNVERIFIED" }> {
  const parsed = lineRecoveryRequestSchema.safeParse(input);
  if (!parsed.success) throw new ForbiddenError();
  const database = dbOf(deps);
  const initialLive = await (deps.liveSession ?? getLiveExactSession)();
  const intent = await database.lineAccountActionIntent.findUnique({ where: { id: input.intentId } });
  const binding = intent?.targetBindingId ? await database.lineAccountBinding.findUnique({ where: { id: intent.targetBindingId } }) : null;
  // Auth liveness is checked again for every attempt, after LINE verification and before locks.
  if (!intent || !binding || intent.userId !== initialLive.userId || binding.userId !== initialLive.userId ||
      !timingSafeHashMatch(intent.sessionHash, hashLineSessionId(initialLive.sessionId)) || intent.action !== "RECOVERY" || intent.consumedAt || intent.expiresAt <= nowOf(deps) ||
      !intent.reviewedSetDigest || intent.targetBindingVersion === null || !timingSafeHashMatch(intent.challengeHash, digest(input.challenge))) throw new ForbiddenError();
  const proof = await (deps.freshIdentity ?? verifyFreshLineIdToken)(input.idToken);
  const now = nowOf(deps);
  if (!Number.isFinite(proof.verifiedAt.getTime()) || proof.verifiedAt < intent.createdAt || proof.verifiedAt > now ||
      now.getTime() - proof.verifiedAt.getTime() > 300_000 || proof.expiresAt <= now ||
      (proof.issuedAt && proof.issuedAt > now)) throw new ForbiddenError();
  const live = await (deps.liveSession ?? getLiveExactSession)();
  const fingerprint = createLineSubjectFingerprint(proof.subject);
  const sessionHash = hashLineSessionId(live.sessionId);
  if (live.userId !== intent.userId || binding.userId !== live.userId || !timingSafeHashMatch(intent.sessionHash, sessionHash) ||
      !timingSafeHashMatch(binding.lineSubjectFingerprint, fingerprint.fingerprint) || binding.lineSubjectFingerprintKeyId !== fingerprint.keyId) throw new ForbiddenError();
  const account = deps.configuration.inventory.channels.find((channel) => channel.kind === "ACCOUNT");
  if (!account) throw new ForbiddenError();
  // Production authority is a private closure over actual Auth + LINE verification.
  const capability = await authorizeLineRecoveryDecision({ ownerUserId: live.userId, bindingId: binding.id,
    bindingVersion: intent.targetBindingVersion, intentId: intent.id, reviewedSetDigest: intent.reviewedSetDigest,
    policyVersion: "LINE_RECOVERY_V1", copyVersion: "LINE_RECOVERY_V1", sessionCheckedAt: live.checkedAt,
    proofTupleKey: lineChannelTupleKey(account), proofVerifiedAt: proof.verifiedAt, proofExpiresAt: proof.expiresAt, manualReviews: input.manualReviews,
  }, { authorize: async (decision) => ({ decision, sessionHash, challengeHash: digest(input.challenge), fingerprint: fingerprint.fingerprint,
    fingerprintKeyId: fingerprint.keyId, riskAcknowledgedAt: now }) });
  await runSerializableTransaction(database, (transaction) => releaseLineRecovery(transaction, capability, deps.configuration.inventory, nowOf(deps)));
  return { status: "RECOVERY_RELEASED_UNVERIFIED" };
}
