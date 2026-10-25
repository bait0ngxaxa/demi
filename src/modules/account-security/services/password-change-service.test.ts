import { Role, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { CurrentPasswordRejectedError } from "../adapters/supabase-account-security-provider";
import { changeAuthenticatedUserPassword, PasswordChangeAttemptThrottledError } from "./password-change-service";

vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }));

const actor: ActorContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: [Role.PATIENT, Role.HOSPITAL, Role.OSM],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const input = {
  currentPassword: "current-password",
  newPassword: "a-different-long-password",
  passwordConfirmation: "a-different-long-password",
};

function createDatabase(): PrismaClient {
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ person: { identityKeyHash: "a".repeat(64) } }) },
    lineAccountBinding: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
}

function createThrottle(blocked = false) {
  return {
    isBlocked: vi.fn().mockResolvedValue(blocked),
    recordFailure: vi.fn().mockResolvedValue(undefined),
  };
}

describe("authenticated account password change", () => {
  it("changes the one authenticated User credential for a multi-role account", async () => {
    const provider = vi.fn().mockResolvedValue({ otherSessionsRevoked: true });
    const audit = vi.fn().mockResolvedValue(undefined);
    const attemptThrottle = createThrottle();

    await expect(changeAuthenticatedUserPassword(actor, input, { provider, audit, database: createDatabase(), attemptThrottle })).resolves.toEqual({ otherSessionsRevoked: true });
    expect(provider).toHaveBeenCalledOnce();
    expect(provider).toHaveBeenCalledWith({
      userId: actor.userId,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
    expect(audit).toHaveBeenCalledWith({
      actorUserId: actor.userId,
      action: "ACCOUNT_PASSWORD_CHANGED",
      resourceType: "USER",
      resourceId: actor.userId,
    });
    expect(attemptThrottle.isBlocked).toHaveBeenCalledWith(expect.objectContaining({ scope: "PASSWORD_CHANGE", clientIp: null }));
    expect(attemptThrottle.recordFailure).not.toHaveBeenCalled();
  });

  it("returns a safe generic failure when the provider rejects the current password", async () => {
    const provider = vi.fn().mockRejectedValue(new Error("wrong password from provider"));

    await expect(changeAuthenticatedUserPassword(actor, input, { provider, database: createDatabase(), attemptThrottle: createThrottle() })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
    expect(provider).toHaveBeenCalledOnce();
  });

  it("requires authentication and validates passwords before provider I/O", async () => {
    const provider = vi.fn();

    await expect(changeAuthenticatedUserPassword(null, input, { provider })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      changeAuthenticatedUserPassword(actor, { ...input, targetUserId: actor.userId }, { provider }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not report a credential as unchanged when only the audit write fails", async () => {
    const provider = vi.fn().mockResolvedValue({ otherSessionsRevoked: true });
    const audit = vi.fn().mockRejectedValue(new Error("database details"));
    const database = createDatabase();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(changeAuthenticatedUserPassword(actor, input, { provider, audit, database, attemptThrottle: createThrottle() })).resolves.toEqual({ otherSessionsRevoked: true });
    expect(consoleError).toHaveBeenCalledWith(
      "Password change succeeded but the security audit event could not be stored",
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(input.currentPassword);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(input.newPassword);
    consoleError.mockRestore();
  });

  it("returns a specific current-password rejection and counts it", async () => {
    const provider = vi.fn().mockRejectedValue(new CurrentPasswordRejectedError());
    const attemptThrottle = createThrottle();

    await expect(changeAuthenticatedUserPassword(actor, input, {
      provider,
      database: createDatabase(),
      attemptThrottle,
      clientIpAddress: "192.0.2.10",
    })).rejects.toBeInstanceOf(CurrentPasswordRejectedError);

    expect(attemptThrottle.recordFailure).toHaveBeenCalledWith(expect.objectContaining({
      scope: "PASSWORD_CHANGE",
      clientIp: "192.0.2.10",
      identityHash: "a".repeat(64),
    }));
  });

  it("blocks current-password verification before provider I/O", async () => {
    const provider = vi.fn();

    await expect(changeAuthenticatedUserPassword(actor, input, {
      provider,
      database: createDatabase(),
      attemptThrottle: createThrottle(true),
    })).rejects.toBeInstanceOf(PasswordChangeAttemptThrottledError);
    expect(provider).not.toHaveBeenCalled();
  });

  it("sends the existing password-change notice to linked LINE accounts", async () => {
    const database = createDatabase();
    vi.mocked(database.lineAccountBinding.findMany).mockResolvedValue([{ lineUserId: "LINE-USER" }] as never);
    const provider = vi.fn().mockResolvedValue({ otherSessionsRevoked: true });
    const sendLineMessage = vi.fn().mockResolvedValue({ kind: "ACCEPTED" });

    await changeAuthenticatedUserPassword(actor, input, {
      provider,
      database,
      attemptThrottle: createThrottle(),
      now: () => new Date("2026-10-25T03:00:00.000Z"),
      sendLineMessage,
    });

    expect(sendLineMessage).toHaveBeenCalledWith(
      "LINE-USER",
      expect.stringContaining("รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยน"),
      expect.any(String),
    );
  });
});
