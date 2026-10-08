import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  LineAccountAction,
  LineAccountActionOutcome,
  LineProviderCleanupState,
  LineReachability,
  LineMenuSyncState,
  UserStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ForbiddenError } from "@/shared/errors/application-error";

import { LineFailure } from "../domain/line-errors";
import { verifyLineFriendship, verifyLineIdToken } from "../adapters/line-login-client";
import { createLineSubjectFingerprint } from "./line-identity-fingerprint";
import { getCurrentLineSession, lineSessionHashMatches, type CurrentLineSession } from "./line-session-service";
import { recordLineFriendshipObservation, type ReachabilityEventState } from "./line-reachability-service";
import { resolveEligibleLineRoles } from "./line-eligibility-service";
import { initializeLineTermination, observeLineAuthorization } from "./line-authorization-lifecycle-service";
import { lineChannelTupleKey, type LineChannelInventory } from "../domain/line-authorization-lifecycle";

const INTENT_TTL_MS = 5 * 60 * 1000;
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export type LineAccountDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  verifyIdentity?: typeof verifyLineIdToken;
  verifyFriendship?: typeof verifyLineFriendship;
  currentSession?: () => Promise<CurrentLineSession>;
  /** Staged server-only composition seam. No route/config enables it until recovery is executable. */
  authorizationInventory?: LineChannelInventory;
};

function databaseOf(dependencies: LineAccountDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function nowOf(dependencies: LineAccountDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

function randomChallenge(): string {
  return randomBytes(32).toString("base64url");
}

function secureDigestMatch(saved: string, submitted: string): boolean {
  const submittedHash = sha256(submitted);
  const left = Buffer.from(saved, "hex");
  const right = Buffer.from(submittedHash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createLineAccountIntent(
  action: LineAccountAction,
  dependencies: LineAccountDependencies = {},
): Promise<{ intentId: string; challenge: string; expiresAt: string }> {
  // Recovery requires a separate live exact-session/proof orchestration, not this legacy session check.
  if (action === LineAccountAction.RECOVERY) throw new ForbiddenError();
  const session = await (dependencies.currentSession ?? getCurrentLineSession)();
  const db = databaseOf(dependencies);
  const now = nowOf(dependencies);
  const challenge = randomChallenge();
  const intent = await runSerializableTransaction(db, async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.userId}::uuid FOR UPDATE`;
    const user = await transaction.user.findUnique({ where: { id: session.userId }, select: { status: true } });
    if (!user || user.status !== UserStatus.ACTIVE) throw new ForbiddenError();
    if (action === LineAccountAction.UNLINK) {
      const binding = await transaction.lineAccountBinding.findFirst({ where: { userId: session.userId, unlinkedAt: null }, select: { id: true } });
      if (!binding) throw new ForbiddenError();
    }
    await transaction.lineAccountActionIntent.deleteMany({
      where: { userId: session.userId, expiresAt: { lte: now } },
    });
    const recentCount = await transaction.lineAccountActionIntent.count({
      where: { userId: session.userId, createdAt: { gt: new Date(now.getTime() - INTENT_TTL_MS) } },
    });
    if (recentCount >= 5) throw new LineFailure("LINE_RATE_LIMITED");
    return transaction.lineAccountActionIntent.create({
      data: {
        userId: session.userId,
        action,
        challengeHash: sha256(challenge),
        sessionHash: session.sessionHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + INTENT_TTL_MS),
      },
      select: { id: true, expiresAt: true },
    });
  });
  return { intentId: intent.id, challenge, expiresAt: intent.expiresAt.toISOString() };
}

async function validateIntentBeforeProvider(
  input: { intentId: string; challenge: string; action: LineAccountAction },
  session: CurrentLineSession,
  database: PrismaClient,
  now: Date,
): Promise<void> {
  const intent = await database.lineAccountActionIntent.findUnique({ where: { id: input.intentId } });
  const user = await database.user.findUnique({ where: { id: session.userId }, select: { status: true } });
  if (
    !intent || intent.userId !== session.userId || intent.action !== input.action || intent.consumedAt ||
    intent.expiresAt <= now || !user || user.status !== UserStatus.ACTIVE ||
    !secureDigestMatch(intent.challengeHash, input.challenge) ||
    !lineSessionHashMatches(intent.sessionHash, session.sessionHash)
  ) {
    throw new LineFailure("LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED");
  }
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function lockUserAndIntent(
  transaction: Prisma.TransactionClient,
  userId: string,
  intentId: string,
): Promise<void> {
  await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  await transaction.$queryRaw`SELECT "id" FROM "LineAccountActionIntent" WHERE "id" = ${intentId}::uuid FOR UPDATE`;
}

function checkIntentInTransaction(
  intent: { userId: string; action: LineAccountAction; challengeHash: string; sessionHash: string; expiresAt: Date; consumedAt: Date | null },
  input: { challenge: string },
  session: CurrentLineSession,
  now: Date,
  action: LineAccountAction,
): boolean {
  return (
    intent.userId === session.userId && intent.action === action && !intent.consumedAt &&
    intent.expiresAt > now && secureDigestMatch(intent.challengeHash, input.challenge) &&
    lineSessionHashMatches(intent.sessionHash, session.sessionHash)
  );
}

export async function linkLineAccount(
  input: { intentId: string; challenge: string; idToken: string; accessToken?: string },
  dependencies: LineAccountDependencies = {},
): Promise<{ status: "LINKED" | "ALREADY_LINKED"; bindingId: string; lifecycleVersion: number }> {
  const session = await (dependencies.currentSession ?? getCurrentLineSession)();
  const now = nowOf(dependencies);
  const database = databaseOf(dependencies);
  await validateIntentBeforeProvider({ ...input, action: LineAccountAction.LINK }, session, database, now);

  const verified = await (dependencies.verifyIdentity ?? verifyLineIdToken)(input.idToken);
  const identity = createLineSubjectFingerprint(verified.subject);
  let friendshipObservation: { state: ReachabilityEventState; checkedAt: Date } | null = null;
  if (input.accessToken) {
    const checkedAt = nowOf(dependencies);
    try {
      const result = await (dependencies.verifyFriendship ?? verifyLineFriendship)(input.accessToken, verified.subject);
      friendshipObservation = {
        state: result.friend ? LineReachability.FRIEND : LineReachability.NOT_FRIEND,
        checkedAt,
      };
    } catch {
      friendshipObservation = null;
    }
  }

  try {
    const result = await runSerializableTransaction(database, async (transaction) => {
      await lockUserAndIntent(transaction, session.userId, input.intentId);
      const user = await transaction.user.findUnique({ where: { id: session.userId }, select: { status: true } });
      const intent = await transaction.lineAccountActionIntent.findUnique({ where: { id: input.intentId } });
      if (!user || user.status !== UserStatus.ACTIVE) throw new LineFailure("DEMI_ACCOUNT_INELIGIBLE");
      if (!intent || !checkIntentInTransaction(intent, input, session, nowOf(dependencies), LineAccountAction.LINK)) {
        throw new LineFailure("LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED");
      }

      const userBinding = await transaction.lineAccountBinding.findFirst({ where: { userId: session.userId, unlinkedAt: null } });
      if (userBinding && userBinding.lineSubjectFingerprint !== identity.fingerprint) {
        await consumeIntent(transaction, intent.id, nowOf(dependencies), LineAccountActionOutcome.CONFLICT);
        return { status: "CONFLICT" as const, bindingId: userBinding.id };
      }

      const incompatibleHistory = await transaction.lineAccountBinding.findFirst({
        where: {
          lineSubjectFingerprint: { not: "" },
          lineSubjectFingerprintKeyId: { not: identity.keyId },
        },
        select: { id: true },
      });
      if (incompatibleHistory) {
        await consumeIntent(transaction, intent.id, nowOf(dependencies), LineAccountActionOutcome.CONFLICT);
        return { status: "CONFLICT" as const, bindingId: userBinding?.id ?? "" };
      }
      const matchingHistory = await transaction.lineAccountBinding.findFirst({
        where: { lineSubjectFingerprint: identity.fingerprint },
        select: {
          id: true,
          userId: true,
          lineSubjectFingerprint: true,
          lineSubjectFingerprintKeyId: true,
          unlinkedAt: true,
        },
      });
      if (userBinding && userBinding.lineSubjectFingerprint === identity.fingerprint) {
        await observeAccountBinding(transaction, userBinding, dependencies, nowOf(dependencies));
        await consumeIntent(transaction, intent.id, nowOf(dependencies), LineAccountActionOutcome.SUCCEEDED);
        return { status: "ALREADY_LINKED" as const, bindingId: userBinding.id, lifecycleVersion: userBinding.lifecycleVersion };
      }
      if (matchingHistory && matchingHistory.userId !== session.userId) {
        await consumeIntent(transaction, intent.id, nowOf(dependencies), LineAccountActionOutcome.CONFLICT);
        return { status: "CONFLICT" as const, bindingId: "" };
      }
      const binding = matchingHistory
        ? await transaction.lineAccountBinding.update({
            where: { id: matchingHistory.id },
            data: {
              lineUserId: verified.subject,
              lastLinkedAt: nowOf(dependencies),
              unlinkedAt: null,
              lifecycleVersion: { increment: 1 },
              presentationRole: null,
              presentationRoleSelectedAt: null,
              reachability: LineReachability.UNKNOWN,
              reachabilityObservedAt: null,
              menuExpectedKey: null,
              menuSyncState: LineMenuSyncState.UNKNOWN,
              menuSyncedAt: null,
              providerCleanupState: null,
              providerCleanupAttemptCount: 0,
              providerCleanupLastAttemptAt: null,
            },
          })
        : await transaction.lineAccountBinding.create({
            data: {
              userId: session.userId,
              lineUserId: verified.subject,
              lineSubjectFingerprint: identity.fingerprint,
              lineSubjectFingerprintKeyId: identity.keyId,
              reachability: LineReachability.UNKNOWN,
              providerCleanupState: null,
            },
          });
      await consumeIntent(transaction, intent.id, nowOf(dependencies), LineAccountActionOutcome.SUCCEEDED);
      await observeAccountBinding(transaction, binding, dependencies, nowOf(dependencies));
      await recordAuditEvent({ actorUserId: session.userId, action: "line.account.linked", resourceType: "LineAccountBinding", resourceId: binding.id }, transaction);
      return {
        status: userBinding ? "ALREADY_LINKED" as const : "LINKED" as const,
        bindingId: binding.id,
        lifecycleVersion: binding.lifecycleVersion,
      };
    });
    if (result.status === "CONFLICT") throw new LineFailure("LINE_BINDING_CONFLICT");
    if (friendshipObservation) {
      try {
        await recordLineFriendshipObservation(
          result.bindingId,
          result.lifecycleVersion,
          friendshipObservation.state,
          friendshipObservation.checkedAt,
          database,
        );
      } catch {
        // The verified identity binding is authoritative; failed friendship persistence stays UNKNOWN.
      }
    }
    return result;
  } catch (error: unknown) {
    if (isUniqueError(error)) throw new LineFailure("LINE_BINDING_CONFLICT");
    throw error;
  }
}

async function consumeIntent(
  transaction: Prisma.TransactionClient,
  intentId: string,
  now: Date,
  outcome: LineAccountActionOutcome,
): Promise<void> {
  await transaction.lineAccountActionIntent.update({
    where: { id: intentId },
    data: { consumedAt: now, outcome },
  });
}

async function observeAccountBinding(
  transaction: Prisma.TransactionClient,
  binding: { id: string; userId: string; lifecycleVersion: number },
  dependencies: LineAccountDependencies,
  now: Date,
): Promise<void> {
  const inventory = dependencies.authorizationInventory;
  if (!inventory) return;
  const account = inventory.channels.find((channel) => channel.kind === "ACCOUNT");
  if (!account) throw new ForbiddenError();
  await observeLineAuthorization(transaction, { ownerUserId: binding.userId, bindingId: binding.id, bindingVersion: binding.lifecycleVersion },
    inventory, lineChannelTupleKey(account), now);
}

export async function unlinkLineAccount(
  input: { intentId: string; challenge: string },
  dependencies: LineAccountDependencies = {},
): Promise<{ status: "UNLINKED"; bindingId: string; lifecycleVersion: number }> {
  const session = await (dependencies.currentSession ?? getCurrentLineSession)();
  const now = nowOf(dependencies);
  const database = databaseOf(dependencies);
  await validateIntentBeforeProvider({ ...input, action: LineAccountAction.UNLINK }, session, database, now);
  try {
    return await runSerializableTransaction(database, async (transaction) => {
      await lockUserAndIntent(transaction, session.userId, input.intentId);
      const user = await transaction.user.findUnique({ where: { id: session.userId }, select: { status: true } });
      const intent = await transaction.lineAccountActionIntent.findUnique({ where: { id: input.intentId } });
      if (!user || user.status !== UserStatus.ACTIVE) throw new LineFailure("UNLINK_UNAUTHORIZED");
      if (!intent || !checkIntentInTransaction(intent, input, session, nowOf(dependencies), LineAccountAction.UNLINK)) {
        throw new LineFailure("LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED");
      }
      const binding = await transaction.lineAccountBinding.findFirst({ where: { userId: session.userId, unlinkedAt: null } });
      if (!binding || !binding.lineUserId) throw new LineFailure("UNLINK_UNAUTHORIZED");
      const updated = await transaction.lineAccountBinding.update({
        where: { id: binding.id },
        data: {
          unlinkedAt: nowOf(dependencies),
          presentationRole: null,
          presentationRoleSelectedAt: null,
          lifecycleVersion: { increment: 1 },
          providerCleanupState: LineProviderCleanupState.PENDING,
          providerCleanupAttemptCount: 0,
          providerCleanupLastAttemptAt: null,
          menuExpectedKey: "UNLINKED",
          menuSyncState: LineMenuSyncState.UNKNOWN,
          menuSyncedAt: null,
        },
      });
      if (dependencies.authorizationInventory) {
        await initializeLineTermination(transaction, updated, dependencies.authorizationInventory, nowOf(dependencies));
      }
      await consumeIntent(transaction, intent.id, nowOf(dependencies), LineAccountActionOutcome.SUCCEEDED);
      await recordAuditEvent({ actorUserId: session.userId, action: "line.account.unlinked", resourceType: "LineAccountBinding", resourceId: binding.id }, transaction);
      return { status: "UNLINKED" as const, bindingId: updated.id, lifecycleVersion: updated.lifecycleVersion };
    });
  } catch (error: unknown) {
    if (isUniqueError(error)) throw new LineFailure("UNLINK_UNAUTHORIZED");
    throw error;
  }
}

export async function getLineAccountSummary(dependencies: LineAccountDependencies = {}): Promise<{
  status: "UNLINKED" | "LINKED" | "INELIGIBLE";
  canUnlink: boolean;
  reachability: LineReachability | null;
  menuState: "UNKNOWN" | "APPLIED" | "MISMATCH" | "UNAVAILABLE" | null;
  cleanupState: "PENDING" | "CONFIRMED_CLEAN" | "MISMATCH" | "UNAVAILABLE" | "UNKNOWN" | null;
}> {
  const session = await (dependencies.currentSession ?? getCurrentLineSession)();
  const user = await databaseOf(dependencies).user.findUnique({ where: { id: session.userId }, select: { status: true } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    return { status: "INELIGIBLE", canUnlink: false, reachability: null, menuState: null, cleanupState: null };
  }
  const binding = await databaseOf(dependencies).lineAccountBinding.findFirst({
    where: { userId: session.userId, unlinkedAt: null },
    select: { reachability: true, menuSyncState: true, providerCleanupState: true },
  });
  if (!binding) {
    const cleanup = await databaseOf(dependencies).lineAccountBinding.findFirst({
      where: {
        userId: session.userId, unlinkedAt: { not: null }, lineUserId: { not: null },
        providerCleanupState: { in: ["PENDING", "UNKNOWN", "UNAVAILABLE", "MISMATCH"] },
      },
      orderBy: [{ unlinkedAt: "desc" }, { id: "desc" }],
      select: { reachability: true, providerCleanupState: true },
    });
    return { status: "UNLINKED", canUnlink: false, reachability: cleanup?.reachability ?? null, menuState: null, cleanupState: cleanup?.providerCleanupState ?? null };
  }
  const eligibleRoles = await resolveEligibleLineRoles(session.userId, databaseOf(dependencies));
  return {
    status: eligibleRoles.length ? "LINKED" : "INELIGIBLE",
    canUnlink: true,
    reachability: binding.reachability,
    menuState: binding.menuSyncState,
    cleanupState: binding.providerCleanupState,
  };
}

export async function refreshLineAccountReachability(
  input: { idToken: string; accessToken: string },
  dependencies: LineAccountDependencies = {},
): Promise<{ bindingId: string }> {
  const session = await (dependencies.currentSession ?? getCurrentLineSession)();
  const database = databaseOf(dependencies);
  const user = await database.user.findUnique({ where: { id: session.userId }, select: { status: true } });
  if (!user || user.status !== UserStatus.ACTIVE) throw new ForbiddenError();
  const select = { id: true, lineUserId: true, lifecycleVersion: true } as const;
  const binding = await database.lineAccountBinding.findFirst({
    where: { userId: session.userId, unlinkedAt: null }, select,
  }) ?? await database.lineAccountBinding.findFirst({
    where: {
      userId: session.userId, unlinkedAt: { not: null }, lineUserId: { not: null },
      providerCleanupState: { in: ["PENDING", "UNKNOWN", "UNAVAILABLE", "MISMATCH"] },
    },
    orderBy: [{ unlinkedAt: "desc" }, { id: "desc" }], select,
  });
  if (!binding?.lineUserId) throw new ForbiddenError();
  const verified = await (dependencies.verifyIdentity ?? verifyLineIdToken)(input.idToken);
  if (verified.subject !== binding.lineUserId) throw new ForbiddenError();
  const checkStartedAt = nowOf(dependencies);
  const friendship = await (dependencies.verifyFriendship ?? verifyLineFriendship)(input.accessToken, verified.subject);
  const accepted = await recordLineFriendshipObservation(
    binding.id, binding.lifecycleVersion,
    friendship.friend ? LineReachability.FRIEND : LineReachability.NOT_FRIEND,
    checkStartedAt, database, true,
  );
  if (!accepted) throw new ForbiddenError();
  return { bindingId: binding.id };
}

export const lineAccountInternals = { sha256, secureDigestMatch, randomChallenge, INTENT_TTL_MS };
