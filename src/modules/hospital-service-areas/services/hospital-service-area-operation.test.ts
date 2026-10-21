import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ConflictError, InfrastructureError } from "@/shared/errors/application-error";

import { operation } from "./hospital-service-area-service";

function databaseFailingWith(error: unknown): PrismaClient {
  return { $transaction: async () => { throw error; } } as unknown as PrismaClient;
}

function triggerError(message: string): Prisma.PrismaClientUnknownRequestError {
  return new Prisma.PrismaClientUnknownRequestError(
    `Error occurred during query execution: ConnectorError(ConnectorError { kind: QueryError(PostgresError { code: "23514", message: "${message}" }) })`,
    { clientVersion: "test" },
  );
}

describe("service area operation error mapping", () => {
  it("maps the network role triggers (SQLSTATE 23514) to a conflict", async () => {
    for (const message of ["Service area requires a PARENT and a CHILD network role", "Network role is referenced by an active service area"]) {
      await expect(operation(databaseFailingWith(triggerError(message)), async () => null)).rejects.toBeInstanceOf(ConflictError);
    }
  });

  it("keeps other database failures as infrastructure errors", async () => {
    await expect(operation(databaseFailingWith(triggerError("Service area history is immutable")), async () => null))
      .rejects.toBeInstanceOf(InfrastructureError);
    await expect(operation(databaseFailingWith(new Error("down")), async () => null)).rejects.toBeInstanceOf(InfrastructureError);
  });
});
