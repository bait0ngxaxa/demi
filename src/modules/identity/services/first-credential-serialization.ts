import "server-only";

import type { Prisma } from "@prisma/client";

/** Serializes credential mutations per User; retain the key for compatibility with existing processes. */
export async function lockCredentialOperation(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext('DEMI_FIRST_CREDENTIAL')) IS NULL AS locked`;
}

/** Existing activation and recovery paths share the same lock while migrating to the broader name. */
export async function lockFirstCredentialOperation(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await lockCredentialOperation(transaction, userId);
}
