import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { recordAuditEvent, recordAuditEvents, recordAuditEventWithId, type AuditDatabase } from "./audit-service";

describe("audit service", () => {
  it("returns a persisted decision ID through the same sensitive-metadata validation boundary", async () => {
    const database = { auditEvent: { create: async () => ({ id: "persisted-audit-id" }) } } as unknown as AuditDatabase;
    const input = { actorUserId: null, action: "line.lifecycle.recovery.released", resourceType: "LineAccountBinding", metadata: { policyVersion: "LINE_RECOVERY_V1" } };
    await expect(recordAuditEventWithId(input, database)).resolves.toBe("persisted-audit-id");
    await expect(recordAuditEventWithId({ ...input, metadata: { accessToken: "must-never-persist" } }, database)).rejects.toThrow();
  });
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

  it("validates every event before persisting a batch in one statement", async () => {
    const createMany = vi.fn<(args: { data: unknown[] }) => Promise<{ count: number }>>(async () => ({ count: 2 }));
    const database = { auditEvent: { createMany } } as unknown as AuditDatabase;
    const event = { actorUserId: null, action: "foundation.test", resourceType: "TestResource" };

    await recordAuditEvents([event, { ...event, resourceId: "r2" }], database);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0]?.[0].data).toHaveLength(2);

    await expect(
      recordAuditEvents([event, { ...event, metadata: { accessToken: "must-never-persist" } }], database),
    ).rejects.toThrow();
    expect(createMany).toHaveBeenCalledTimes(1);

    await recordAuditEvents([], database);
    expect(createMany).toHaveBeenCalledTimes(1);
  });
});
