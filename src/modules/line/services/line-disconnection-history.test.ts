import { UserStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { hasLineLifecycleHistoryForCurrentOwner } from "./line-disconnection-service";

const currentSession = { userId: "00000000-0000-4000-8000-000000000001", sessionHash: "a".repeat(64) };

function createDatabase() {
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ status: UserStatus.ACTIVE }) },
    lineAccountBinding: { findMany: vi.fn().mockResolvedValue([{ id: "binding-1" }]) },
    lineAuthorizationLifecycle: { count: vi.fn().mockResolvedValue(1) },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("staged Account lifecycle history probe", () => {
  it("checks only the authenticated owner's recorded termination obligations", async () => {
    const database = createDatabase();

    await expect(hasLineLifecycleHistoryForCurrentOwner({
      database: database as unknown as PrismaClient,
      currentSession: async () => currentSession,
    })).resolves.toBe(true);

    expect(database.user.findUnique).toHaveBeenCalledWith({
      where: { id: currentSession.userId }, select: { status: true },
    });
    expect(database.lineAccountBinding.findMany).toHaveBeenCalledWith({
      where: { userId: currentSession.userId }, select: { id: true },
    });
    expect(database.lineAuthorizationLifecycle.count).toHaveBeenCalledWith({ where: { bindingId: { in: ["binding-1"] } } });
  });

  it("does not require lifecycle-table access for an owner with no binding history", async () => {
    const database = createDatabase();
    database.lineAccountBinding.findMany.mockResolvedValue([]);

    await expect(hasLineLifecycleHistoryForCurrentOwner({
      database: database as unknown as PrismaClient,
      currentSession: async () => currentSession,
    })).resolves.toBe(false);
    expect(database.lineAuthorizationLifecycle.count).not.toHaveBeenCalled();
    expect(database.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it("retains a degraded local-Unlink audit marker after the feature gate is disabled", async () => {
    const database = createDatabase();
    database.lineAuthorizationLifecycle.count.mockResolvedValue(0);
    database.auditEvent.findMany.mockResolvedValue([{ metadata: { disconnectionReadiness: "UNAVAILABLE" } }]);

    await expect(hasLineLifecycleHistoryForCurrentOwner({
      database: database as unknown as PrismaClient,
      currentSession: async () => currentSession,
    })).resolves.toBe(true);
    expect(database.auditEvent.findMany).toHaveBeenCalledWith({
      where: { action: "line.account.unlinked", resourceType: "LineAccountBinding", resourceId: { in: ["binding-1"] } },
      select: { metadata: true },
    });
  });

  it("fails closed for an inactive owner and propagates lifecycle-table failures", async () => {
    const inactive = createDatabase();
    inactive.user.findUnique.mockResolvedValue({ status: UserStatus.SUSPENDED });
    await expect(hasLineLifecycleHistoryForCurrentOwner({
      database: inactive as unknown as PrismaClient,
      currentSession: async () => currentSession,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(inactive.lineAccountBinding.findMany).not.toHaveBeenCalled();

    const unavailable = createDatabase();
    unavailable.lineAuthorizationLifecycle.count.mockRejectedValue(new Error("lifecycle migration unavailable"));
    await expect(hasLineLifecycleHistoryForCurrentOwner({
      database: unavailable as unknown as PrismaClient,
      currentSession: async () => currentSession,
    })).rejects.toThrow("lifecycle migration unavailable");
  });
});
