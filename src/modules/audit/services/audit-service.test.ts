import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { recordAuditEvent, type AuditDatabase } from "./audit-service";

describe("audit service", () => {
  it("accepts a transaction-compatible database dependency", async () => {
    const created: Array<Record<string, unknown>> = [];
    const database = {
      auditEvent: {
        create: async ({ data }: { data: unknown }) => {
          created.push(data as unknown as Record<string, unknown>);
          return {} as never;
        },
      },
    } as unknown as AuditDatabase;

    await recordAuditEvent(
      {
        actorUserId: null,
        action: "foundation.test",
        resourceType: "TestResource",
        resourceId: "resource-1",
        metadata: { result: "ok" },
      },
      database,
    );

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      action: "foundation.test",
      resourceType: "TestResource",
      resourceId: "resource-1",
    });
  });

  it("preserves retryable transaction conflicts for the enclosing service", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("serialization conflict", {
      code: "P2034",
      clientVersion: "test",
    });
    const database = {
      auditEvent: {
        create: async () => {
          throw conflict;
        },
      },
    } as unknown as AuditDatabase;

    await expect(
      recordAuditEvent(
        {
          actorUserId: null,
          action: "foundation.test",
          resourceType: "TestResource",
          resourceId: "resource-1",
          metadata: { result: "ok" },
        },
        database,
      ),
    ).rejects.toBe(conflict);
  });
});
