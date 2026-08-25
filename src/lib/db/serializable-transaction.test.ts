import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  runSerializableTransaction,
  type SerializableTransactionDatabase,
} from "./serializable-transaction";

describe("serializable transaction helper", () => {
  it("uses Serializable isolation and retries a bounded write conflict", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("write conflict", {
      code: "P2034",
      clientVersion: "6.19.2",
    });
    const transaction = {} as Prisma.TransactionClient;
    const operation = vi.fn().mockResolvedValue("committed");
    const database = {
      $transaction: vi
        .fn()
        .mockRejectedValueOnce(conflict)
        .mockImplementationOnce(
          async (
            callback: (supplied: Prisma.TransactionClient) => Promise<string>,
            options: { isolationLevel: Prisma.TransactionIsolationLevel },
          ): Promise<string> => {
            expect(options).toEqual({
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            });
            return callback(transaction);
          },
        ),
    } as unknown as SerializableTransactionDatabase;

    await expect(runSerializableTransaction(database, operation, 1)).resolves.toBe("committed");
    expect(database.$transaction).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledWith(transaction);
  });

  it("does not retry a non-retryable failure", async () => {
    const failure = new Error("operation failed");
    const database = {
      $transaction: vi.fn().mockRejectedValue(failure),
    } as unknown as SerializableTransactionDatabase;

    await expect(
      runSerializableTransaction(database, async () => "not reached"),
    ).rejects.toBe(failure);
    expect(database.$transaction).toHaveBeenCalledOnce();
  });
});
