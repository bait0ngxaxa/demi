import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

export type SerializableTransactionDatabase = Pick<PrismaClient, "$transaction">;

export const DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES = 2;

export function isRetryableSerializableTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export async function runSerializableTransaction<T>(
  database: SerializableTransactionDatabase,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  retryLimit = DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
): Promise<T> {
  let retryCount = 0;

  while (true) {
    try {
      return await database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (!isRetryableSerializableTransactionError(error) || retryCount >= retryLimit) {
        throw error;
      }

      retryCount += 1;
    }
  }
}
