import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getActor: vi.fn(),
  signOut: vi.fn(),
  issue: vi.fn(),
  revoke: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/env/server", () => ({
  createApplicationCredentialUrlBuilder: () => ({ build: (token: string) => `https://demi.example/recover#${token}` }),
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.getActor }));
vi.mock("@/modules/auth/services/authentication-service", () => ({ signOutCurrentSession: mocks.signOut }));
vi.mock("../services/password-change-service", () => ({ changeAuthenticatedUserPassword: vi.fn() }));
vi.mock("../services/account-recovery-service", () => ({
  completePatientAccountRecovery: vi.fn(),
  getPatientAccountRecoveryAvailability: vi.fn(),
  issuePatientAccountRecovery: vi.fn(),
}));
vi.mock("../services/mediated-password-reset-service", () => ({
  completeMediatedPasswordReset: mocks.complete,
  getMediatedPasswordResetAvailability: vi.fn(),
  issueMediatedPasswordReset: mocks.issue,
  listQuarantinedMediatedPasswordResets: vi.fn(),
  reconcileMediatedPasswordReset: vi.fn(),
  revokeIssuedMediatedPasswordReset: mocks.revoke,
  searchMediatedPasswordResetTargets: vi.fn(),
}));
vi.mock("../adapters/supabase-account-security-provider", async () => {
  const { ValidationError } = await import("@/shared/errors/application-error");
  class ProviderIdentityRejectedError extends ValidationError {
    constructor(readonly reason: "PASSWORD_POLICY" | "INVALID_REQUEST") { super(); }
  }
  return { ProviderIdentityRejectedError };
});

import { ProviderIdentityRejectedError } from "../adapters/supabase-account-security-provider";
import { completeMediatedPasswordResetAction, issueMediatedPasswordResetAction } from "./server-actions";

const actor = { userId: "11111111-1111-4111-8111-111111111111" };
const input = {
  hospitalId: "22222222-2222-4222-8222-222222222222",
  relationshipId: "33333333-3333-4333-8333-333333333333",
  targetKind: "staff" as const,
  verificationMethod: "IN_PERSON_ID_CARD" as const,
};

function issued(mode: "IN_PERSON" | "ONLINE") {
  return { resetId: "44444444-4444-4444-8444-444444444444", token: "one-time-token", mode, expiresAt: new Date("2026-10-23T03:15:00.000Z") };
}

describe("mediated password reset actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getActor.mockResolvedValue(actor);
  });

  it("signs the issuer out after issuing an in-person reset", async () => {
    mocks.issue.mockResolvedValue(issued("IN_PERSON"));
    mocks.signOut.mockResolvedValue(undefined);

    await expect(issueMediatedPasswordResetAction({ ...input, mode: "IN_PERSON" })).resolves.toEqual({
      status: "ISSUED", mode: "IN_PERSON", handoffUrl: "https://demi.example/recover#one-time-token", expiresAt: "2026-10-23T03:15:00.000Z",
    });
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.issue.mock.invocationCallOrder[0]);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("revokes the issued in-person reset and returns no link when sign-out fails", async () => {
    mocks.issue.mockResolvedValue(issued("IN_PERSON"));
    mocks.signOut.mockRejectedValue(new Error("sign out failed"));
    mocks.revoke.mockResolvedValue(undefined);

    const result = await issueMediatedPasswordResetAction({ ...input, mode: "IN_PERSON" });

    expect(mocks.revoke).toHaveBeenCalledWith(actor, { resetId: "44444444-4444-4444-8444-444444444444" });
    expect(result).toEqual({ status: "ERROR", message: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain("one-time-token");
  });

  it("keeps the issuer signed in for an online reset", async () => {
    mocks.issue.mockResolvedValue(issued("ONLINE"));

    await expect(issueMediatedPasswordResetAction({ ...input, mode: "ONLINE" })).resolves.toMatchObject({ status: "ISSUED", mode: "ONLINE" });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("returns a password field error when the provider rejects the password by policy", async () => {
    mocks.complete.mockRejectedValue(new ProviderIdentityRejectedError("PASSWORD_POLICY"));
    const formData = new FormData();

    await expect(completeMediatedPasswordResetAction({ status: "IDLE" }, formData)).resolves.toMatchObject({
      status: "ERROR",
      fieldErrors: { newPassword: expect.stringContaining("รหัสผ่าน") },
    });
  });
});
