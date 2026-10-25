import "server-only";

import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";

/** Atomically consumes the pending self-service reset notice so it appears on one signed-in page load. */
export async function consumePasswordResetNotice(
  userId: string,
  database: PrismaClient = getPrisma(),
): Promise<Date | null> {
  return database.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { passwordResetNoticePendingAt: true },
    });
    const pendingAt = user?.passwordResetNoticePendingAt;
    if (!pendingAt) return null;

    const consumed = await transaction.user.updateMany({
      where: { id: userId, passwordResetNoticePendingAt: pendingAt },
      data: { passwordResetNoticePendingAt: null },
    });
    return consumed.count === 1 ? pendingAt : null;
  });
}
