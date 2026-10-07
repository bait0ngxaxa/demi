import "server-only";

import { LineProviderCleanupState } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";

import { getCurrentLineSession } from "./line-session-service";
import { reconcileLineBinding } from "./line-menu-reconciler";

export async function reconcileCurrentLineAccount(): Promise<void> {
  const session = await getCurrentLineSession();
  const database = getPrisma();
  const active = await database.lineAccountBinding.findFirst({
    where: { userId: session.userId, unlinkedAt: null },
    select: { id: true },
  });
  if (active) {
    await reconcileLineBinding(active.id);
    return;
  }
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
  if (cleanup) await reconcileLineBinding(cleanup.id);
}
