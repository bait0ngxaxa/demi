import "server-only";

import type { Prisma } from "@prisma/client";

/** Serializes short first-credential claims across workforce and Patient activation paths. */
export async function lockFirstCredentialOperation(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext('DEMI_FIRST_CREDENTIAL')) IS NULL AS locked`;
}
