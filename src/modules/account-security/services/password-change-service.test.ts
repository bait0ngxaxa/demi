import { Role, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, ValidationError } from "@/shared/errors/application-error";

import { CurrentPasswordRejectedError, PasswordChangeProviderNotStartedError } from "../adapters/supabase-account-security-provider";
import {
  changeAuthenticatedUserPassword,
  PasswordChangeAttemptThrottledError,
  PasswordChangeOutcomeUncertainError,
  PasswordChangeRecoveryPendingError,
} from "./password-change-service";

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

type PasswordChangeTestState = {
  operationId: string | null;
  startedAt: Date | null;
  reconciliationRequiredAt: Date | null;
  unresolvedReset: boolean;
  revocations: { workforce: number; patient: number; line: number };
};

function createDatabase(initial: Partial<PasswordChangeTestState> = {}): { database: PrismaClient; state: PasswordChangeTestState } {
  const state: PasswordChangeTestState = {
    operationId: null,
    startedAt: null,
    reconciliationRequiredAt: null,
    unresolvedReset: false,
    revocations: { workforce: 0, patient: 0, line: 0 },
    ...initial,
  };
  const user = {
    findUnique: vi.fn(async (args: { select?: { person?: unknown } }) => args.select?.person
      ? { person: { identityKeyHash: "a".repeat(64) } }
      : {
        passwordChangeOperationId: state.operationId,
        passwordChangeStartedAt: state.startedAt,
        passwordChangeReconciliationRequiredAt: state.reconciliationRequiredAt,
      }),
    updateMany: vi.fn(async (args: {
      where: { passwordChangeOperationId?: string | null };
      data: Record<string, unknown>;
    }) => {
      const expected = args.where.passwordChangeOperationId;
      if (expected === null ? state.operationId !== null : expected !== undefined && state.operationId !== expected) return { count: 0 };
      if ("passwordChangeOperationId" in args.data) state.operationId = args.data.passwordChangeOperationId as string | null;
      if ("passwordChangeStartedAt" in args.data) state.startedAt = args.data.passwordChangeStartedAt as Date | null;
      if ("passwordChangeReconciliationRequiredAt" in args.data) state.reconciliationRequiredAt = args.data.passwordChangeReconciliationRequiredAt as Date | null;
      return { count: 1 };
    }),
  };
  const recoveryTable = (key: keyof PasswordChangeTestState["revocations"]) => ({
    findFirst: vi.fn(async () => state.unresolvedReset ? { id: "claimed-reset" } : null),
    updateMany: vi.fn(async () => { state.revocations[key] += 1; return { count: 0 }; }),
  });
  const transaction = {
    user,
    workforceActivation: recoveryTable("workforce"),
    accountRecovery: recoveryTable("patient"),
    linePasswordRecoveryCapability: recoveryTable("line"),
    $queryRaw: vi.fn(async () => [{ acquired: true }]),
  };
  const database = {
    ...transaction,
    lineAccountBinding: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction)),
  } as unknown as PrismaClient;
  return { database, state };
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
    const { database, state } = createDatabase();

    await expect(changeAuthenticatedUserPassword(actor, input, { provider, audit, database, attemptThrottle })).resolves.toEqual({ otherSessionsRevoked: true });
    expect(provider).toHaveBeenCalledOnce();
    expect(provider).toHaveBeenCalledWith({
      userId: actor.userId,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      deadline: expect.any(Number),
      signal: expect.any(AbortSignal),
    });
    expect(audit).toHaveBeenCalledWith({
      actorUserId: actor.userId,
      action: "ACCOUNT_PASSWORD_CHANGED",
      resourceType: "USER",
      resourceId: actor.userId,
    });
    expect(attemptThrottle.isBlocked).toHaveBeenCalledWith(expect.objectContaining({ scope: "PASSWORD_CHANGE", clientIp: null }));
    expect(attemptThrottle.recordFailure).not.toHaveBeenCalled();
    expect(state.operationId).toBeNull();
    expect(state.revocations).toEqual({ workforce: 1, patient: 1, line: 1 });
  });

  it("keeps recovery fenced when the provider password-change outcome is ambiguous", async () => {
    const provider = vi.fn().mockRejectedValue(new Error("provider timeout"));
    const { database, state } = createDatabase();

    await expect(changeAuthenticatedUserPassword(actor, input, { provider, database, attemptThrottle: createThrottle() })).rejects.toBeInstanceOf(PasswordChangeOutcomeUncertainError);
    expect(provider).toHaveBeenCalledOnce();
    expect(state.operationId).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(state.reconciliationRequiredAt).toBeInstanceOf(Date);
    expect(state.revocations).toEqual({ workforce: 0, patient: 0, line: 0 });
  });

  it("releases the fence without revoking links when provider update never started", async () => {
    const provider = vi.fn().mockRejectedValue(new PasswordChangeProviderNotStartedError());
    const { database, state } = createDatabase();

    await expect(changeAuthenticatedUserPassword(actor, input, { provider, database, attemptThrottle: createThrottle() })).rejects.toBeInstanceOf(PasswordChangeProviderNotStartedError);
    expect(state.operationId).toBeNull();
    expect(state.reconciliationRequiredAt).toBeNull();
    expect(state.revocations).toEqual({ workforce: 0, patient: 0, line: 0 });
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
    const { database } = createDatabase();
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
    const { database, state } = createDatabase();

    await expect(changeAuthenticatedUserPassword(actor, input, {
      provider,
      database,
      attemptThrottle,
      clientIpAddress: "192.0.2.10",
    })).rejects.toBeInstanceOf(CurrentPasswordRejectedError);

    expect(attemptThrottle.recordFailure).toHaveBeenCalledWith(expect.objectContaining({
      scope: "PASSWORD_CHANGE",
      clientIp: "192.0.2.10",
      identityHash: "a".repeat(64),
    }));
    expect(state.operationId).toBeNull();
    expect(state.reconciliationRequiredAt).toBeNull();
    expect(state.revocations).toEqual({ workforce: 0, patient: 0, line: 0 });
  });

  it("blocks current-password verification before provider I/O", async () => {
    const provider = vi.fn();

    await expect(changeAuthenticatedUserPassword(actor, input, {
      provider,
      database: createDatabase().database,
      attemptThrottle: createThrottle(true),
    })).rejects.toBeInstanceOf(PasswordChangeAttemptThrottledError);
    expect(provider).not.toHaveBeenCalled();
  });

  it("sends the existing password-change notice to linked LINE accounts", async () => {
    const { database } = createDatabase();
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

  it("does not begin password change while a claimed or quarantined reset is unresolved", async () => {
    const provider = vi.fn();
    const { database, state } = createDatabase({ unresolvedReset: true });

    await expect(changeAuthenticatedUserPassword(actor, input, { provider, database, attemptThrottle: createThrottle() })).rejects.toBeInstanceOf(PasswordChangeRecoveryPendingError);
    expect(provider).not.toHaveBeenCalled();
    expect(state.operationId).toBeNull();
    expect(state.revocations).toEqual({ workforce: 0, patient: 0, line: 0 });
  });
});
