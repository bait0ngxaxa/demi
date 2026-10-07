import "server-only";

import { LineReachability, type Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";

import { nextReachabilityObservation } from "../domain/line-projection";

export type ReachabilityEventState = Exclude<LineReachability, "UNKNOWN">;
type Database = PrismaClient | Prisma.TransactionClient;

export async function applyLineReachabilityObservation(
  database: Database,
  lineUserId: string,
  state: ReachabilityEventState,
  observedAt: Date,
): Promise<readonly string[]> {
  const bindings = await database.lineAccountBinding.findMany({
    where: { lineUserId },
    select: { id: true, lifecycleVersion: true, reachability: true, reachabilityObservedAt: true, unlinkedAt: true },
  });
  const changed: string[] = [];
  for (const binding of bindings) {
    await database.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${binding.id}::uuid FOR UPDATE`;
    const decision = nextReachabilityObservation(
      { state: binding.reachability, observedAt: binding.reachabilityObservedAt },
      { state, observedAt },
    );
    if (decision === "IGNORE") continue;
    const updated = await database.lineAccountBinding.updateMany({
      where: {
        id: binding.id,
        lifecycleVersion: binding.lifecycleVersion,
        reachabilityObservedAt: binding.reachabilityObservedAt,
      },
      data: {
        reachability: decision === "CONFLICT" ? LineReachability.UNKNOWN : state,
        reachabilityObservedAt: observedAt,
        ...(state === LineReachability.FRIEND && binding.unlinkedAt
          ? { providerCleanupLastAttemptAt: null }
          : {}),
      },
    });
    if (updated.count) changed.push(binding.id);
  }
  return changed;
}

export async function recordLineFriendshipObservation(
  bindingId: string,
  lifecycleVersion: number,
  state: ReachabilityEventState,
  observedAt = new Date(),
  database: PrismaClient = getPrisma(),
): Promise<boolean> {
  return database.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "LineAccountBinding" WHERE "id" = ${bindingId}::uuid FOR UPDATE`;
    const binding = await transaction.lineAccountBinding.findUnique({
      where: { id: bindingId },
      select: { lifecycleVersion: true, reachability: true, reachabilityObservedAt: true, unlinkedAt: true },
    });
    if (!binding || binding.lifecycleVersion !== lifecycleVersion || binding.unlinkedAt) return false;
    const decision = nextReachabilityObservation(
      { state: binding.reachability, observedAt: binding.reachabilityObservedAt },
      { state, observedAt },
    );
    if (decision === "IGNORE") return true;
    await transaction.lineAccountBinding.update({
      where: { id: bindingId },
      data: {
        reachability: decision === "CONFLICT" ? LineReachability.UNKNOWN : state,
        reachabilityObservedAt: observedAt,
      },
    });
    return true;
  });
}

export function isLinePushReachabilityEligible(state: LineReachability): boolean {
  return state === LineReachability.FRIEND;
}
