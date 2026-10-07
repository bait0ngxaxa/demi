import "server-only";

import { LineProviderCleanupState } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";

import { getCurrentLineSession } from "./line-session-service";

export async function resolveCurrentLineReconciliationTarget(): Promise<string | null> {
  const session = await getCurrentLineSession();
  const database = getPrisma();
  const active = await database.lineAccountBinding.findFirst({
    where: { userId: session.userId, unlinkedAt: null },
    select: { id: true },
  });
  if (active) return active.id;
  const cleanup = await database.lineAccountBinding.findFirst({
    where: {
      userId: session.userId,
      unlinkedAt: { not: null },
      providerCleanupState: {
        in: [
          LineProviderCleanupState.PENDING,
          LineProviderCleanupState.MISMATCH,
          LineProviderCleanupState.UNAVAILABLE,
          LineProviderCleanupState.UNKNOWN,
        ],
      },
    },
    orderBy: { lastLinkedAt: "desc" },
    select: { id: true },
  });
  return cleanup?.id ?? null;
}
