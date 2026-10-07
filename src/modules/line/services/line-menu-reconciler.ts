import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  LineMenuSyncState,
  LineProviderCleanupState,
  LineReachability,
  type LineAccountBinding,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";

import { LineMessagingClient } from "../adapters/line-messaging-client";
import { LineFailure } from "../domain/line-errors";
import { projectLineMenu } from "../domain/line-projection";
import type { LineMenuSyncState as LineMenuSyncStateType } from "@prisma/client";
import { LINE_RICH_MENU_BY_ALIAS, LINE_RICH_MENU_BY_KEY } from "../rich-menu/catalog";
import { resolveEligibleLineRoles } from "./line-eligibility-service";

const RECONCILE_LEASE_MS = 90_000;
const MAX_STALE_RECONCILES = 2;
const CLEANUP_RETRY_BASE_MS = 60_000;
const CLEANUP_RETRY_MAX_MS = 24 * 60 * 60 * 1000;

export type LinePresentationProvider = Pick<
  LineMessagingClient,
  "getAlias" | "listAliases" | "linkUserMenu" | "getUserMenu" | "unlinkUserMenu"
>;

export type LineReconcileDependencies = {
  database?: PrismaClient;
  provider?: LinePresentationProvider;
  now?: () => Date;
};

type LeaseClaim = Pick<LineAccountBinding,
  | "id"
  | "userId"
  | "lineUserId"
  | "unlinkedAt"
  | "lifecycleVersion"
  | "presentationRole"
  | "presentationRoleSelectedAt"
  | "reachability"
  | "reachabilityObservedAt"
  | "menuExpectedKey"
  | "providerCleanupState"
  | "providerCleanupAttemptCount"
  | "providerCleanupLastAttemptAt"
  | "reconcileLeaseToken"
>;

function getDatabase(dependencies: LineReconcileDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function getProvider(dependencies: LineReconcileDependencies): LinePresentationProvider {
  return dependencies.provider ?? new LineMessagingClient();
}

function nowOf(dependencies: LineReconcileDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

async function acquireLease(
  bindingId: string,
  dependencies: LineReconcileDependencies,
): Promise<{ binding: LeaseClaim; token: string } | null> {
  const db = getDatabase(dependencies);
  const now = nowOf(dependencies);
  const initial = await db.lineAccountBinding.findUnique({ where: { id: bindingId }, select: { lifecycleVersion: true } });
  if (!initial) return null;
  const token = randomUUID();
  return db.$transaction(async (transaction) => {
    const claimed = await transaction.$queryRaw<LeaseClaim[]>`
      UPDATE "LineAccountBinding"
      SET "reconcileLeaseToken" = ${token}::uuid,
          "reconcileLeaseExpiresAt" = ${new Date(now.getTime() + RECONCILE_LEASE_MS)}
      WHERE "id" = ${bindingId}::uuid
        AND "lifecycleVersion" = ${initial.lifecycleVersion}
        AND ("reconcileLeaseExpiresAt" IS NULL OR "reconcileLeaseExpiresAt" <= ${now})
      RETURNING "id", "userId", "lineUserId", "unlinkedAt", "lifecycleVersion",
        "presentationRole", "reachability", "reachabilityObservedAt", "menuExpectedKey",
        "presentationRoleSelectedAt", "providerCleanupState", "providerCleanupAttemptCount",
        "providerCleanupLastAttemptAt", "reconcileLeaseToken"
    `;
    const binding = claimed[0];
    return binding ? { binding, token } : null;
  });
}

async function currentWithLease(
  bindingId: string,
  version: number,
  token: string,
  database: PrismaClient,
  now = new Date(),
): Promise<LeaseClaim | null> {
  const row = await database.lineAccountBinding.findFirst({
    where: {
      id: bindingId,
      lifecycleVersion: version,
      reconcileLeaseToken: token,
      reconcileLeaseExpiresAt: { gt: now },
    },
    select: {
      id: true,
      userId: true,
      lineUserId: true,
      unlinkedAt: true,
      lifecycleVersion: true,
      presentationRole: true,
      presentationRoleSelectedAt: true,
      reachability: true,
      reachabilityObservedAt: true,
      menuExpectedKey: true,
      providerCleanupState: true,
      providerCleanupAttemptCount: true,
      providerCleanupLastAttemptAt: true,
      reconcileLeaseToken: true,
    },
  });
  return row as LeaseClaim | null;
}

async function releaseLease(
  bindingId: string,
  token: string,
  database: PrismaClient,
): Promise<void> {
  await database.lineAccountBinding.updateMany({
    where: { id: bindingId, reconcileLeaseToken: token },
    data: { reconcileLeaseToken: null, reconcileLeaseExpiresAt: null },
  });
}

async function persistMenuOutcome(
  binding: LeaseClaim,
  token: string,
  state: LineMenuSyncStateType,
  menuKey: string,
  database: PrismaClient,
): Promise<void> {
  await database.lineAccountBinding.updateMany({
    where: {
      id: binding.id,
      lifecycleVersion: binding.lifecycleVersion,
      reconcileLeaseToken: token,
      unlinkedAt: null,
    },
    data: {
      menuExpectedKey: menuKey,
      menuSyncState: state,
      menuSyncedAt: state === LineMenuSyncState.APPLIED ? new Date() : null,
    },
  });
}

async function persistCleanupOutcome(
  binding: LeaseClaim,
  token: string,
  state: LineProviderCleanupState,
  database: PrismaClient,
  clearLocator: boolean,
): Promise<void> {
  await database.lineAccountBinding.updateMany({
    where: {
      id: binding.id,
      lifecycleVersion: binding.lifecycleVersion,
      reconcileLeaseToken: token,
      unlinkedAt: { not: null },
      reachability: LineReachability.FRIEND,
      reachabilityObservedAt: binding.reachabilityObservedAt,
    },
    data: {
      providerCleanupState: state,
      lineUserId: clearLocator ? null : binding.lineUserId,
    },
  });
}

function cleanupRetryDelayMs(bindingId: string, attemptCount: number): number {
  const exponent = Math.max(0, Math.min(20, attemptCount - 1));
  const baseDelay = Math.min(CLEANUP_RETRY_MAX_MS, CLEANUP_RETRY_BASE_MS * 2 ** exponent);
  const jitter = createHash("sha256")
    .update(`${bindingId}:${attemptCount}`, "utf8")
    .digest()
    .readUInt16BE(0) / 65_535 * 0.4 - 0.2;
  return Math.min(CLEANUP_RETRY_MAX_MS, Math.max(CLEANUP_RETRY_BASE_MS, Math.round(baseDelay * (1 + jitter))));
}

function cleanupRetryIsDue(binding: LeaseClaim, now: Date): boolean {
  const lastAttemptAt = binding.providerCleanupLastAttemptAt;
  return !lastAttemptAt || now.getTime() - lastAttemptAt.getTime() >= cleanupRetryDelayMs(binding.id, binding.providerCleanupAttemptCount);
}

async function markCleanupAttempt(
  binding: LeaseClaim,
  token: string,
  dependencies: LineReconcileDependencies,
): Promise<boolean> {
  const updated = await getDatabase(dependencies).lineAccountBinding.updateMany({
    where: {
      id: binding.id,
      lifecycleVersion: binding.lifecycleVersion,
      reconcileLeaseToken: token,
      unlinkedAt: { not: null },
      reachability: LineReachability.FRIEND,
      reachabilityObservedAt: binding.reachabilityObservedAt,
    },
    data: {
      providerCleanupAttemptCount: { increment: 1 },
      providerCleanupLastAttemptAt: nowOf(dependencies),
    },
  });
  return updated.count === 1;
}

function roleFromWorkspaceMenuKey(key: string): "PATIENT" | "OSM" | "HOSPITAL" | null {
  const role = key.split("_")[0];
  return role === "PATIENT" || role === "OSM" || role === "HOSPITAL" ? role : null;
}

async function recoverWorkspacePreferenceFromReadback(
  binding: LeaseClaim,
  token: string,
  actualRichMenuId: string | null,
  eligibleRoles: readonly ("PATIENT" | "OSM" | "HOSPITAL")[],
  dependencies: LineReconcileDependencies,
): Promise<LeaseClaim> {
  if (!actualRichMenuId || eligibleRoles.length < 2) return binding;
  const db = getDatabase(dependencies);
  const aliases = await getProvider(dependencies).listAliases();
  const currentAlias = aliases.find(({ richMenuId }) => richMenuId === actualRichMenuId);
  if (!currentAlias) return binding;
  const menu = LINE_RICH_MENU_BY_ALIAS.get(currentAlias.richMenuAliasId);
  if (!menu) return binding;
  const role = roleFromWorkspaceMenuKey(menu.key);
  const expectedKey = role ? `${role}_${eligibleRoles.join("_")}` : "";
  if (!role || !eligibleRoles.includes(role) || menu.key !== expectedKey) return binding;

  const selectedAt = nowOf(dependencies);
  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${binding.id}::uuid FOR UPDATE`;
    const current = await transaction.lineAccountBinding.findFirst({
      where: {
        id: binding.id,
        lifecycleVersion: binding.lifecycleVersion,
        reconcileLeaseToken: token,
        reconcileLeaseExpiresAt: { gt: selectedAt },
        unlinkedAt: null,
      },
      select: { presentationRole: true, presentationRoleSelectedAt: true, userId: true },
    });
    if (!current || (current.presentationRoleSelectedAt && current.presentationRoleSelectedAt >= selectedAt)) return binding;
    const latestEligibleRoles = await resolveEligibleLineRoles(current.userId, transaction);
    const latestExpectedKey = `${role}_${latestEligibleRoles.join("_")}`;
    if (latestEligibleRoles.length < 2 || !latestEligibleRoles.includes(role) || latestExpectedKey !== menu.key) return binding;
    await transaction.lineAccountBinding.update({
      where: { id: binding.id },
      data: {
        presentationRole: role,
        presentationRoleSelectedAt: selectedAt,
        menuExpectedKey: menu.key,
        menuSyncState: LineMenuSyncState.UNKNOWN,
        menuSyncedAt: null,
      },
    });
    return { ...binding, presentationRole: role, presentationRoleSelectedAt: selectedAt };
  });
}

async function reconcileActive(
  binding: LeaseClaim,
  token: string,
  dependencies: LineReconcileDependencies,
): Promise<void> {
  const db = getDatabase(dependencies);
  const provider = getProvider(dependencies);
  if (!binding.lineUserId) return;
  const roles = await resolveEligibleLineRoles(binding.userId, db);
  const user = await db.user.findUnique({ where: { id: binding.userId }, select: { status: true } });
  const initialProjection = projectLineMenu({
    hasBinding: true,
    active: true,
    userActive: user?.status === "ACTIVE",
    eligibleRoles: roles,
    presentationRole: binding.presentationRole,
  });
  if (binding.reachability !== LineReachability.FRIEND) {
    await persistMenuOutcome(binding, token, LineMenuSyncState.UNKNOWN, initialProjection.menuKey, db);
    return;
  }

  let currentProviderMenuId: string | null;
  try {
    currentProviderMenuId = await provider.getUserMenu(binding.lineUserId);
  } catch {
    await persistMenuOutcome(binding, token, LineMenuSyncState.UNAVAILABLE, initialProjection.menuKey, db);
    return;
  }

  let projectedBinding: LeaseClaim;
  try {
    projectedBinding = await recoverWorkspacePreferenceFromReadback(binding, token, currentProviderMenuId, roles, dependencies);
  } catch {
    await persistMenuOutcome(binding, token, LineMenuSyncState.UNAVAILABLE, initialProjection.menuKey, db);
    return;
  }
  const projection = projectLineMenu({
    hasBinding: true,
    active: true,
    userActive: user?.status === "ACTIVE",
    eligibleRoles: roles,
    presentationRole: projectedBinding.presentationRole,
  });
  const menu = LINE_RICH_MENU_BY_KEY.get(projection.menuKey);
  if (!menu) throw new LineFailure("RICH_MENU_MISMATCH");

  let aliasRichMenuId: string | null;
  try {
    aliasRichMenuId = await provider.getAlias(menu.alias);
  } catch {
    await persistMenuOutcome(binding, token, LineMenuSyncState.UNAVAILABLE, projection.menuKey, db);
    return;
  }
  if (!aliasRichMenuId) {
    await persistMenuOutcome(binding, token, LineMenuSyncState.UNAVAILABLE, projection.menuKey, db);
    return;
  }
  const live = await currentWithLease(binding.id, binding.lifecycleVersion, token, db, nowOf(dependencies));
  if (!live || live.unlinkedAt || live.lineUserId !== binding.lineUserId || live.reachability !== LineReachability.FRIEND) {
    return;
  }

  try {
    if (currentProviderMenuId !== aliasRichMenuId) {
      await provider.linkUserMenu(binding.lineUserId, aliasRichMenuId);
    }
    const current = await currentWithLease(binding.id, binding.lifecycleVersion, token, db, nowOf(dependencies));
    if (!current || current.unlinkedAt || current.reachability !== LineReachability.FRIEND) {
      return;
    }
    const actual = currentProviderMenuId === aliasRichMenuId
      ? currentProviderMenuId
      : await provider.getUserMenu(binding.lineUserId);
    const newest = await currentWithLease(binding.id, binding.lifecycleVersion, token, db, nowOf(dependencies));
    if (!newest || newest.unlinkedAt) {
      return;
    }
    await persistMenuOutcome(binding, token, actual === aliasRichMenuId ? LineMenuSyncState.APPLIED : LineMenuSyncState.MISMATCH, projection.menuKey, db);
  } catch (error: unknown) {
    await persistMenuOutcome(binding, token, LineMenuSyncState.UNAVAILABLE, projection.menuKey, db);
    if (error instanceof LineFailure) return;
    throw error;
  }
}

async function reconcileUnlinked(
  binding: LeaseClaim,
  token: string,
  dependencies: LineReconcileDependencies,
): Promise<void> {
  const db = getDatabase(dependencies);
  const provider = getProvider(dependencies);
  if (binding.providerCleanupState === LineProviderCleanupState.CONFIRMED_CLEAN || !binding.lineUserId) return;
  if (binding.reachability !== LineReachability.FRIEND) {
    await db.lineAccountBinding.updateMany({
      where: { id: binding.id, lifecycleVersion: binding.lifecycleVersion, reconcileLeaseToken: token, unlinkedAt: { not: null } },
      data: { providerCleanupState: LineProviderCleanupState.UNKNOWN },
    });
    return;
  }
  if (!cleanupRetryIsDue(binding, nowOf(dependencies))) return;
  const live = await currentWithLease(binding.id, binding.lifecycleVersion, token, db, nowOf(dependencies));
  if (!live || live.unlinkedAt === null || live.reachability !== LineReachability.FRIEND || live.lineUserId !== binding.lineUserId) {
    return;
  }
  if (!await markCleanupAttempt(binding, token, dependencies)) return;
  try {
    await provider.unlinkUserMenu(binding.lineUserId);
    const afterDelete = await currentWithLease(binding.id, binding.lifecycleVersion, token, db, nowOf(dependencies));
    if (!afterDelete || afterDelete.unlinkedAt === null || afterDelete.reachability !== LineReachability.FRIEND || afterDelete.reachabilityObservedAt?.getTime() !== binding.reachabilityObservedAt?.getTime()) {
      return;
    }
    const actual = await provider.getUserMenu(binding.lineUserId);
    const afterReadback = await currentWithLease(binding.id, binding.lifecycleVersion, token, db, nowOf(dependencies));
    if (!afterReadback || afterReadback.reachability !== LineReachability.FRIEND || afterReadback.reachabilityObservedAt?.getTime() !== binding.reachabilityObservedAt?.getTime()) {
      return;
    }
    if (actual === null) {
      await persistCleanupOutcome(binding, token, LineProviderCleanupState.CONFIRMED_CLEAN, db, true);
    } else {
      await persistCleanupOutcome(binding, token, LineProviderCleanupState.MISMATCH, db, false);
    }
  } catch (error: unknown) {
    const outcome = error instanceof LineFailure && error.code === "LINE_PROVIDER_PERMANENT"
      ? LineProviderCleanupState.MISMATCH
      : LineProviderCleanupState.UNAVAILABLE;
    await persistCleanupOutcome(binding, token, outcome, db, false);
  }
}

export async function reconcileLineBinding(
  bindingId: string,
  dependencies: LineReconcileDependencies = {},
  staleAttempt = 0,
): Promise<"RECONCILED" | "BUSY" | "MISSING"> {
  const db = getDatabase(dependencies);
  const claim = await acquireLease(bindingId, dependencies);
  if (!claim) {
    const exists = await db.lineAccountBinding.findUnique({ where: { id: bindingId }, select: { id: true } });
    return exists ? "BUSY" : "MISSING";
  }
  const { binding, token } = claim;
  try {
    if (binding.unlinkedAt) await reconcileUnlinked(binding, token, dependencies);
    else await reconcileActive(binding, token, dependencies);
  } catch {
    if (binding.unlinkedAt) {
      await db.lineAccountBinding.updateMany({
        where: { id: binding.id, lifecycleVersion: binding.lifecycleVersion, reconcileLeaseToken: token, unlinkedAt: { not: null } },
        data: {
          providerCleanupState: LineProviderCleanupState.UNAVAILABLE,
        },
      });
    } else {
      await db.lineAccountBinding.updateMany({
        where: { id: binding.id, lifecycleVersion: binding.lifecycleVersion, reconcileLeaseToken: token, unlinkedAt: null },
        data: { menuSyncState: LineMenuSyncState.UNAVAILABLE, menuSyncedAt: null },
      });
    }
  } finally {
    await releaseLease(binding.id, token, db);
  }
  const latest = await db.lineAccountBinding.findUnique({
    where: { id: bindingId },
    select: {
      userId: true,
      lifecycleVersion: true,
      unlinkedAt: true,
      presentationRole: true,
      reachability: true,
      reachabilityObservedAt: true,
      menuExpectedKey: true,
      menuSyncState: true,
    },
  });
  if (latest && staleAttempt < MAX_STALE_RECONCILES) {
    let stale = latest.lifecycleVersion !== binding.lifecycleVersion || Boolean(latest.unlinkedAt) !== Boolean(binding.unlinkedAt);
    stale ||= latest.reachability !== binding.reachability || latest.reachabilityObservedAt?.getTime() !== binding.reachabilityObservedAt?.getTime();
    if (!stale && !latest.unlinkedAt && latest.menuSyncState !== LineMenuSyncState.UNAVAILABLE) {
      const roles = await resolveEligibleLineRoles(latest.userId, db);
      const user = await db.user.findUnique({ where: { id: latest.userId }, select: { status: true } });
      const expected = projectLineMenu({
        hasBinding: true,
        active: true,
        userActive: user?.status === "ACTIVE",
        eligibleRoles: roles,
        presentationRole: latest.presentationRole,
      });
      stale = latest.menuExpectedKey !== expected.menuKey;
    }
    if (stale) await reconcileLineBinding(bindingId, dependencies, staleAttempt + 1);
  }
  return "RECONCILED";
}

export async function reconcileLineBindingIds(
  bindingIds: readonly string[],
  dependencies: LineReconcileDependencies = {},
): Promise<{ reconciled: number; busy: number; missing: number }> {
  let reconciled = 0;
  let busy = 0;
  let missing = 0;
  for (const bindingId of bindingIds) {
    const outcome = await reconcileLineBinding(bindingId, dependencies);
    if (outcome === "RECONCILED") reconciled += 1;
    else if (outcome === "BUSY") busy += 1;
    else missing += 1;
  }
  return { reconciled, busy, missing };
}

export const lineMenuReconcilerInternals = {
  RECONCILE_LEASE_MS,
  acquireLease,
  releaseLease,
  persistCleanupOutcome,
  persistMenuOutcome,
  cleanupRetryDelayMs,
  cleanupRetryIsDue,
  markCleanupAttempt,
};
