import "server-only";

import { randomUUID } from "node:crypto";
import { LineAccountAction, LineAccountActionOutcome, Prisma, UserStatus, type LineAccountBinding, type LineAuthorizationLifecycle } from "@prisma/client";

import { recordAuditEvent, recordAuditEventWithId } from "@/modules/audit/services/audit-service";
import { ForbiddenError } from "@/shared/errors/application-error";

import {
  isLineObligationSatisfied, isLineRecoveryEligible, lineChannelInventorySchema,
  lineChannelTupleDefinition, lineChannelTupleKey, lineObligationSetDigest, type LineChannelInventory,
} from "../domain/line-authorization-lifecycle";
import { timingSafeHashMatch } from "./line-session-service";

export type LineLifecycleTarget = { ownerUserId: string; bindingId: string; bindingVersion: number };
export type LineAttemptTarget = LineLifecycleTarget & { tupleKey: string; attemptId: string };

async function lockBinding(
  transaction: Prisma.TransactionClient, target: LineLifecycleTarget, intentId?: string,
): Promise<LineAccountBinding> {
  await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${target.ownerUserId}::uuid FOR UPDATE`;
  if (intentId) await transaction.$queryRaw`SELECT "id" FROM "LineAccountActionIntent" WHERE "id" = ${intentId}::uuid FOR UPDATE`;
  await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${target.bindingId}::uuid FOR UPDATE`;
  const binding = await transaction.lineAccountBinding.findUnique({ where: { id: target.bindingId } });
  if (!binding || binding.userId !== target.ownerUserId) throw new ForbiddenError();
  return binding;
}

async function lockRows(transaction: Prisma.TransactionClient, bindingId: string): Promise<LineAuthorizationLifecycle[]> {
  await transaction.$queryRaw`SELECT "id" FROM "LineAuthorizationLifecycle" WHERE "bindingId" = ${bindingId}::uuid ORDER BY "tupleKey", "id" FOR UPDATE`;
  const rows = await transaction.lineAuthorizationLifecycle.findMany({
    where: { bindingId }, orderBy: [{ tupleKey: "asc" }, { id: "asc" }],
  });
  return rows;
}

async function requireActiveOwner(transaction: Prisma.TransactionClient, ownerUserId: string): Promise<void> {
  const user = await transaction.user.findUnique({ where: { id: ownerUserId }, select: { status: true } });
  if (user?.status !== UserStatus.ACTIVE) throw new ForbiddenError();
}

function requireCurrentRevoked(binding: LineAccountBinding, target: LineLifecycleTarget): void {
  if (!binding.unlinkedAt || binding.lifecycleVersion !== target.bindingVersion) throw new ForbiddenError();
}

async function auditTransition(transaction: Prisma.TransactionClient, target: LineLifecycleTarget, action: string, metadata: Record<string, string | number>): Promise<void> {
  await recordAuditEvent({ actorUserId: target.ownerUserId, action, resourceType: "LineAccountBinding", resourceId: target.bindingId,
    metadata: { bindingVersion: target.bindingVersion, ...metadata } }, transaction);
}

/** Called inside unlink's existing transaction, after User/intent/binding locks and version advance.
 * No provider calls; an unavailable adapter is explicitly unconfirmed, never successful.
 */
export async function initializeLineTermination(
  transaction: Prisma.TransactionClient, binding: LineAccountBinding,
  trustedInventory: LineChannelInventory, now: Date,
): Promise<void> {
  const inventory = lineChannelInventorySchema.parse(trustedInventory);
  if (!binding.unlinkedAt) throw new ForbiddenError();
  const current = await transaction.lineAccountBinding.findUnique({ where: { id: binding.id } });
  if (!current || current.userId !== binding.userId || !current.unlinkedAt || current.lifecycleVersion !== binding.lifecycleVersion) throw new ForbiddenError();
  // One latest row per actual retained tuple; no per-user history-size cutoff
  // that could prevent local unlink after many generations.
  const latestIds = await transaction.$queryRaw<Array<{ id: string }>>`SELECT DISTINCT ON ("tupleKey") "id"
    FROM "LineAuthorizationLifecycle" WHERE "bindingId" = ${binding.id}::uuid ORDER BY "tupleKey", "bindingVersion" DESC`;
  const history = latestIds.length ? await transaction.lineAuthorizationLifecycle.findMany({ where: { id: { in: latestIds.map((row) => row.id) } } }) : [];
  const historyByTuple = new Map(history.map((row) => [row.tupleKey, row]));
  const channelsByTuple = new Map(inventory.channels.map((channel) => [lineChannelTupleKey(channel), channel]));
  const keys = new Set([...channelsByTuple.keys(), ...historyByTuple.keys()]);
  let createdCount = 0;
  for (const tupleKey of [...keys].sort()) {
    const prior = historyByTuple.get(tupleKey);
    if (prior?.bindingVersion === binding.lifecycleVersion) continue; // Never overwrite attempts/releases.
    const channel = channelsByTuple.get(tupleKey);
    const tupleDefinition = channel ? lineChannelTupleDefinition(channel) : prior?.tupleDefinition;
    if (!tupleDefinition) throw new ForbiddenError();
    const observed = prior?.applicability === "OBSERVED";
    const absent = (!prior || prior.applicability === "PROVEN_ABSENT") && channel?.exclusionReference !== undefined;
    await transaction.lineAuthorizationLifecycle.create({ data: {
      bindingId: binding.id, bindingVersion: binding.lifecycleVersion, tupleKey, tupleDefinition,
      applicability: observed ? "OBSERVED" : absent ? "PROVEN_ABSENT" : "UNKNOWN",
      evidenceReference: observed ? prior.evidenceReference : absent ? channel.exclusionReference ?? inventory.revision : inventory.revision,
      observedAt: observed ? prior.observedAt : null,
      remoteOutcome: "REMOTE_UNCONFIRMED", requestedAt: now,
      reason: "TOKEN_UNAVAILABLE",
    } });
    createdCount += 1;
  }
  if (createdCount === 0) return;
  await auditTransition(transaction, { ownerUserId: binding.userId, bindingId: binding.id, bindingVersion: binding.lifecycleVersion },
    "line.lifecycle.initialized", { inventoryRevision: inventory.revision, tupleCount: createdCount, miniExclusion: inventory.miniExclusionReference ?? "NONE" });
}

/** Only after server identity verification and binding match; cannot mint a scope. */
export async function observeLineAuthorization(
  transaction: Prisma.TransactionClient, target: LineLifecycleTarget,
  trustedInventory: LineChannelInventory, tupleKey: string, now: Date,
): Promise<void> {
  const inventory = lineChannelInventorySchema.parse(trustedInventory);
  const channel = inventory.channels.find((entry) => lineChannelTupleKey(entry) === tupleKey);
  if (!channel || channel.exclusionReference) throw new ForbiddenError();
  const binding = await lockBinding(transaction, target);
  await requireActiveOwner(transaction, target.ownerUserId);
  if (binding.unlinkedAt || binding.lifecycleVersion !== target.bindingVersion) throw new ForbiddenError();
  await lockRows(transaction, binding.id);
  await transaction.lineAuthorizationLifecycle.upsert({
    where: { bindingId_bindingVersion_tupleKey: { bindingId: binding.id, bindingVersion: target.bindingVersion, tupleKey } },
    create: { bindingId: binding.id, bindingVersion: target.bindingVersion, tupleKey, tupleDefinition: lineChannelTupleDefinition(channel), applicability: "OBSERVED", evidenceReference: inventory.revision, observedAt: now },
    update: { applicability: "OBSERVED", evidenceReference: inventory.revision, observedAt: now },
  });
  await auditTransition(transaction, target, "line.lifecycle.observed", { tupleKey, inventoryRevision: inventory.revision });
}

/** Transaction-compatible final guard. Caller owns User/binding locks; no idempotent-success bypass. */
export async function evaluateLineRelinkEligibility(transaction: Prisma.TransactionClient, target: LineLifecycleTarget, now = new Date()): Promise<{
  eligible: boolean; blockedCount: number; recoveryAvailable: boolean;
}> {
  const binding = await transaction.lineAccountBinding.findUnique({ where: { id: target.bindingId } });
  if (!binding || binding.userId !== target.ownerUserId || binding.lifecycleVersion !== target.bindingVersion) throw new ForbiddenError();
  const rows = await transaction.lineAuthorizationLifecycle.findMany({ where: { bindingId: target.bindingId, requestedAt: { not: null } } });
  const blocked = rows.filter((row) => !isLineObligationSatisfied(row));
  // A legacy revoked binding without tracked obligations cannot prove release.
  const missing = binding.unlinkedAt !== null && !rows.some((row) => row.bindingVersion === binding.lifecycleVersion);
  return { eligible: !missing && blocked.length === 0, blockedCount: blocked.length + Number(missing),
    recoveryAvailable: binding.unlinkedAt !== null && !missing && blocked.length > 0 && blocked.every((row) => isLineRecoveryEligible(row, now)) };
}

export async function reserveLineTerminationAttempt(
  transaction: Prisma.TransactionClient, target: LineLifecycleTarget & { tupleKey: string },
  trustedInventory: LineChannelInventory, now: Date,
): Promise<LineAttemptTarget | null> {
  const inventory = lineChannelInventorySchema.parse(trustedInventory);
  if (!inventory.channels.some((channel) => lineChannelTupleKey(channel) === target.tupleKey && !channel.exclusionReference)) throw new ForbiddenError();
  const binding = await lockBinding(transaction, target);
  requireCurrentRevoked(binding, target);
  const rows = await lockRows(transaction, binding.id);
  const row = rows.find((entry) => entry.bindingVersion === target.bindingVersion && entry.tupleKey === target.tupleKey);
  if (!row?.requestedAt || row.attemptId || isLineObligationSatisfied(row)) return null;
  const attemptId = randomUUID();
  await transaction.lineAuthorizationLifecycle.update({ where: { id: row.id }, data: {
    attemptId, reservedAt: now, remoteOutcome: "REMOTE_UNCONFIRMED", reason: "ATTEMPT_RESERVED",
  } });
  await auditTransition(transaction, target, "line.lifecycle.attempt.reserved", { tupleKey: target.tupleKey, attemptId });
  return { ...target, attemptId };
}

export type LineProviderEvidence = "PROVIDER_204" | "PROVIDER_REJECTED" | "INVALID_RESPONSE" | "POSSIBLY_DISPATCHED" | "KNOWN_NOT_DISPATCHED";

/** Original reservation holder's pre-dispatch recheck. A true result is NOT a
 * transferable send permit or LINE cancellation/drain guarantee. Never redispatch. */
export async function isLineTerminationDispatchAllowed(
  transaction: Prisma.TransactionClient, attempt: LineAttemptTarget,
): Promise<boolean> {
  const binding = await lockBinding(transaction, attempt);
  if (!binding.unlinkedAt || binding.lifecycleVersion !== attempt.bindingVersion) return false;
  const rows = await lockRows(transaction, binding.id);
  const row = rows.find((entry) => entry.bindingVersion === attempt.bindingVersion && entry.tupleKey === attempt.tupleKey && entry.attemptId === attempt.attemptId);
  return Boolean(row?.requestedAt && row.reservedAt && !row.settledAt && !row.recoveryReleasedAt && row.reason === "ATTEMPT_RESERVED");
}

/** Adapter-only sanitized result. No transport exposes this as client authority. */
export async function recordLineTerminationOutcome(
  transaction: Prisma.TransactionClient, target: LineAttemptTarget,
  evidence: LineProviderEvidence, now: Date,
): Promise<boolean> {
  if (!["PROVIDER_204", "PROVIDER_REJECTED", "INVALID_RESPONSE", "POSSIBLY_DISPATCHED", "KNOWN_NOT_DISPATCHED"].includes(evidence)) throw new ForbiddenError();
  const binding = await lockBinding(transaction, target); // Current version deliberately NOT required for historical evidence.
  const rows = await lockRows(transaction, binding.id);
  const row = rows.find((entry) => entry.bindingVersion === target.bindingVersion && entry.tupleKey === target.tupleKey && entry.attemptId === target.attemptId);
  if (!row || !row.reservedAt || now < row.reservedAt || row.settledAt) return false;
  const definitive = evidence === "PROVIDER_204" || evidence === "PROVIDER_REJECTED" || evidence === "KNOWN_NOT_DISPATCHED";
  await transaction.lineAuthorizationLifecycle.update({ where: { id: row.id }, data: {
    remoteOutcome: evidence === "PROVIDER_204" ? "REMOTE_CONFIRMED" : "REMOTE_UNCONFIRMED",
    reason: evidence, settledAt: definitive ? now : null, confirmedAt: evidence === "PROVIDER_204" ? now : null,
  } });
  await auditTransition(transaction, target, "line.lifecycle.attempt.result", { tupleKey: target.tupleKey, attemptId: target.attemptId, result: evidence });
  return true;
}

export type AuthorizedLineRecoveryDecision = {
  ownerUserId: string;
  bindingId: string;
  bindingVersion: number;
  intentId: string;
  reviewedSetDigest: string;
  policyVersion: "LINE_RECOVERY_V1";
  copyVersion: "LINE_RECOVERY_V1";
  sessionCheckedAt: Date;
  proofTupleKey: string;
  proofVerifiedAt: Date;
  proofExpiresAt: Date;
  manualReviews: Readonly<Record<string, "REMOVED" | "NOT_LISTED" | "UNDETERMINED">>;
};

/** Server orchestration capability combining Auth-owned liveness with LINE-owned proof.
 * No default, public route, or caller-supplied `verified=true`. Tests supply trusted fixtures.
 */
export type LineRecoveryAuthority = {
  /** Runs OUTSIDE any transaction. Must verify captured same-JWT live session,
   * single-use challenge, acknowledgement, fresh channel proof and fingerprint.
   * Production composition is private to line-disconnection-service; transport
   * callers never supply this authority or a verification result. */
  authorize: (request: AuthorizedLineRecoveryDecision) => Promise<{
    decision: AuthorizedLineRecoveryDecision;
    sessionHash: string;
    challengeHash: string;
    fingerprint: string;
    fingerprintKeyId: string;
    riskAcknowledgedAt: Date;
  }>;
};

const authorizedDecisions = new WeakMap<object, Awaited<ReturnType<LineRecoveryAuthority["authorize"]>>>();
const recoveryCapabilityBrand: unique symbol = Symbol("line-recovery-capability");
export type LineRecoveryCapability = { readonly [recoveryCapabilityBrand]: true };

/** An opaque, process-local authorization result, never a reusable credential.
 * SQL intent consumption fences replay and remains valid across transaction retries. */
export async function authorizeLineRecoveryDecision(
  request: AuthorizedLineRecoveryDecision, authority: LineRecoveryAuthority,
): Promise<LineRecoveryCapability> {
  const evidence = await authority.authorize(request);
  const decision = evidence.decision;
  const capability: LineRecoveryCapability = Object.freeze({ [recoveryCapabilityBrand]: true });
  authorizedDecisions.set(capability, { ...evidence, riskAcknowledgedAt: new Date(evidence.riskAcknowledgedAt), decision: {
    ...decision, manualReviews: { ...decision.manualReviews }, sessionCheckedAt: new Date(decision.sessionCheckedAt),
    proofVerifiedAt: new Date(decision.proofVerifiedAt), proofExpiresAt: new Date(decision.proofExpiresAt),
  } });
  return capability;
}

export async function releaseLineRecovery(
  transaction: Prisma.TransactionClient, capability: LineRecoveryCapability,
  trustedInventory: LineChannelInventory, now: Date,
): Promise<string> {
  const evidence = authorizedDecisions.get(capability);
  if (!evidence) throw new ForbiddenError();
  const decision = evidence.decision;
  const inventory = lineChannelInventorySchema.parse(trustedInventory);
  const binding = await lockBinding(transaction, decision, decision.intentId);
  await requireActiveOwner(transaction, decision.ownerUserId);
  requireCurrentRevoked(binding, decision);
  const rows = (await lockRows(transaction, binding.id)).filter((row) => row.requestedAt && !isLineObligationSatisfied(row));
  const digest = lineObligationSetDigest(rows, inventory);
  const intent = await transaction.lineAccountActionIntent.findUnique({ where: { id: decision.intentId } });
  const fresh = (date: Date): boolean => Number.isFinite(date.getTime()) && date <= now && now.getTime() - date.getTime() <= 5 * 60_000;
  if (!intent || intent.action !== LineAccountAction.RECOVERY || intent.userId !== decision.ownerUserId || intent.consumedAt ||
      intent.expiresAt <= now || intent.targetBindingId !== binding.id || intent.targetBindingVersion !== decision.bindingVersion ||
      !intent.reviewedSetDigest || !timingSafeHashMatch(intent.reviewedSetDigest, digest) || !timingSafeHashMatch(decision.reviewedSetDigest, digest) ||
      !timingSafeHashMatch(intent.sessionHash, evidence.sessionHash) || !timingSafeHashMatch(intent.challengeHash, evidence.challengeHash) ||
      !timingSafeHashMatch(binding.lineSubjectFingerprint, evidence.fingerprint) || binding.lineSubjectFingerprintKeyId !== evidence.fingerprintKeyId ||
      rows.length === 0 || !rows.every((row) => isLineRecoveryEligible(row, now)) ||
      Object.keys(decision.manualReviews).length !== rows.length || !rows.every((row) => ["REMOVED", "NOT_LISTED", "UNDETERMINED"].includes(decision.manualReviews[row.id])) ||
      decision.policyVersion !== "LINE_RECOVERY_V1" || decision.copyVersion !== "LINE_RECOVERY_V1" ||
      !fresh(decision.sessionCheckedAt) || now.getTime() - decision.sessionCheckedAt.getTime() > 10_000 ||
      !fresh(evidence.riskAcknowledgedAt) || evidence.riskAcknowledgedAt < intent.createdAt ||
      !fresh(decision.proofVerifiedAt) || decision.proofVerifiedAt < intent.createdAt ||
      !Number.isFinite(decision.proofExpiresAt.getTime()) || decision.proofExpiresAt <= now ||
      !inventory.channels.some((channel) => lineChannelTupleKey(channel) === decision.proofTupleKey && !channel.exclusionReference)) throw new ForbiddenError();
  const auditId = await recordAuditEventWithId({ actorUserId: decision.ownerUserId, action: "line.lifecycle.recovery.released",
    resourceType: "LineAccountBinding", resourceId: binding.id, metadata: {
      bindingVersion: decision.bindingVersion, setDigest: digest, tupleCount: rows.length,
      intentId: intent.id, riskAcknowledgedAt: evidence.riskAcknowledgedAt.toISOString(), proofMayRenewGrant: true,
      policyVersion: decision.policyVersion, copyVersion: decision.copyVersion,
      sessionCheckedAt: decision.sessionCheckedAt.toISOString(), sessionMatched: true,
      proofTupleKey: decision.proofTupleKey, proofVerifiedAt: decision.proofVerifiedAt.toISOString(),
      proofExpiresAt: decision.proofExpiresAt.toISOString(), fingerprintMatched: true, riskAcknowledged: true,
      inventoryRevision: inventory.revision,
    } }, transaction);
  for (const row of rows) {
    await transaction.lineAuthorizationLifecycle.update({ where: { id: row.id }, data: { recoveryReleasedAt: now, recoveryDecisionAuditId: auditId } });
    await auditTransition(transaction, { ...decision, bindingVersion: row.bindingVersion }, "line.lifecycle.recovery.row", {
      tupleKey: row.tupleKey, decisionAuditId: auditId, manualReview: decision.manualReviews[row.id],
    });
  }
  await transaction.lineAccountActionIntent.update({ where: { id: intent.id }, data: { consumedAt: now, outcome: LineAccountActionOutcome.SUCCEEDED } });
  return auditId;
}

/** Preparation seam; session/challenge issuance belongs to authenticated orchestration.
 * Returns only selectors to persist on its existing five-minute Recovery intent in the same tx.
 */
export async function prepareLineRecoverySet(
  transaction: Prisma.TransactionClient, target: LineLifecycleTarget,
  trustedInventory: LineChannelInventory, now: Date,
): Promise<{ reviewedSetDigest: string; rowIds: string[] }> {
  const inventory = lineChannelInventorySchema.parse(trustedInventory);
  const binding = await lockBinding(transaction, target);
  await requireActiveOwner(transaction, target.ownerUserId);
  requireCurrentRevoked(binding, target);
  // Deterministic lazy initialization for legacy revoked bindings. No provider
  // calls, grant-absence inference, or lifecycle increment during preparation.
  await initializeLineTermination(transaction, binding, inventory, now);
  const rows = (await lockRows(transaction, binding.id)).filter((row) => row.requestedAt && !isLineObligationSatisfied(row));
  if (!rows.length || !rows.every((row) => isLineRecoveryEligible(row, now))) throw new ForbiddenError();
  return { reviewedSetDigest: lineObligationSetDigest(rows, inventory), rowIds: rows.map((row) => row.id) };
}
