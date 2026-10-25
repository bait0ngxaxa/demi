import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getActor: vi.fn(),
  signOut: vi.fn(),
  issue: vi.fn(),
  revoke: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "192.0.2.1" }) }));
vi.mock("@/lib/env/server", () => ({
  createApplicationCredentialUrlBuilder: () => ({ build: (token: string) => `https://demi.example/recover#${token}` }),
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.getActor }));
vi.mock("@/modules/auth/services/authentication-service", () => ({ signOutCurrentSession: mocks.signOut }));
vi.mock("../services/password-change-service", async () => {
  const { ConflictError, InfrastructureError } = await import("@/shared/errors/application-error");
  return {
    changeAuthenticatedUserPassword: vi.fn(),
    PasswordChangeAttemptThrottledError: class PasswordChangeAttemptThrottledError extends Error {},
    PasswordChangeRecoveryPendingError: class PasswordChangeRecoveryPendingError extends ConflictError {
      constructor() { super("An account recovery operation is already in progress"); }
    },
    PasswordChangeOutcomeUncertainError: class PasswordChangeOutcomeUncertainError extends InfrastructureError {
      constructor() { super("The password change outcome requires reconciliation"); }
    },
  };
});
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
  class CurrentPasswordRejectedError extends Error {}
  class PasswordChangeProviderRejectedError extends ValidationError {
    constructor() { super("The provider rejected the new password"); }
  }
  return { CurrentPasswordRejectedError, PasswordChangeProviderRejectedError, ProviderIdentityRejectedError };
});

import {
  CurrentPasswordRejectedError,
  PasswordChangeProviderRejectedError,
  ProviderIdentityRejectedError,
} from "../adapters/supabase-account-security-provider";
import {
  changeAuthenticatedUserPassword,
  PasswordChangeAttemptThrottledError,
  PasswordChangeOutcomeUncertainError,
  PasswordChangeRecoveryPendingError,
} from "../services/password-change-service";
import { changeAuthenticatedPasswordAction, completeMediatedPasswordResetAction, issueMediatedPasswordResetAction } from "./server-actions";

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

  it("returns the same Thai identity error for an existing and unknown National ID", async () => {
    mocks.complete
      .mockRejectedValueOnce(new ForbiddenError("The National ID did not match"))
      .mockRejectedValueOnce(new NotFoundError("No account matched the National ID"));
    const existingIdentityResult = await completeMediatedPasswordResetAction({ status: "IDLE" }, new FormData());
    const unknownIdentityResult = await completeMediatedPasswordResetAction({ status: "IDLE" }, new FormData());

    expect(existingIdentityResult).toEqual(unknownIdentityResult);
    expect(existingIdentityResult).toEqual({
      status: "ERROR",
      message: "ยืนยันตัวตนไม่สำเร็จ ลิงก์อาจหมดอายุหรือใช้ครบจำนวนครั้งแล้ว กรุณาติดต่อโรงพยาบาล",
    });
  });

  it("returns a current-password field error without exposing provider details", async () => {
    vi.mocked(changeAuthenticatedUserPassword).mockRejectedValue(new CurrentPasswordRejectedError());
    const result = await changeAuthenticatedPasswordAction({ status: "IDLE" }, new FormData());

    expect(result).toEqual({
      status: "ERROR",
      message: "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาตรวจสอบข้อมูล",
      fieldErrors: { currentPassword: "รหัสผ่านปัจจุบันไม่ถูกต้อง" },
    });
  });
});

describe("authenticated password change action outcomes", () => {
  const sensitive = /reconciliation|provider|operation|Error|[0-9a-f]{8}-[0-9a-f]{4}/i;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getActor.mockResolvedValue(actor);
  });

  async function changePassword() {
    return changeAuthenticatedPasswordAction({ status: "IDLE" }, new FormData());
  }

  it("confirms a successful change", async () => {
    vi.mocked(changeAuthenticatedUserPassword).mockResolvedValue({ otherSessionsRevoked: true });

    await expect(changePassword()).resolves.toEqual({ status: "SUCCESS", message: "เปลี่ยนรหัสผ่านของบัญชี DEMI แล้ว" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/personal/password");
  });

  it("keeps the session-revocation warning on a confirmed change", async () => {
    vi.mocked(changeAuthenticatedUserPassword).mockResolvedValue({ otherSessionsRevoked: false });

    await expect(changePassword()).resolves.toEqual({
      status: "SUCCESS",
      message: "เปลี่ยนรหัสผ่านแล้ว แต่ระบบออกจากระบบในอุปกรณ์อื่นไม่สำเร็จ กรุณาออกจากระบบในอุปกรณ์เหล่านั้นด้วยตนเอง",
    });
  });

  it("keeps attempt throttling on the current-password field", async () => {
    vi.mocked(changeAuthenticatedUserPassword).mockRejectedValue(new PasswordChangeAttemptThrottledError());

    await expect(changePassword()).resolves.toMatchObject({
      status: "ERROR",
      fieldErrors: { currentPassword: expect.stringContaining("15 นาที") },
    });
  });

  it("states that a provider-rejected new password was not changed and can be corrected", async () => {
    vi.mocked(changeAuthenticatedUserPassword).mockRejectedValue(new PasswordChangeProviderRejectedError());
    const result = await changePassword();

    expect(result).toEqual({
      status: "ERROR",
      message: "ยังไม่ได้เปลี่ยนรหัสผ่าน ระบบไม่รับรหัสผ่านใหม่นี้ กรุณาตั้งรหัสผ่านใหม่ที่ต่างจากรหัสเดิมและคาดเดายาก แล้วลองอีกครั้ง",
    });
    expect(result.message).not.toMatch(sensitive);
  });

  it("explains a pending credential operation without inviting a retry", async () => {
    vi.mocked(changeAuthenticatedUserPassword).mockRejectedValue(new PasswordChangeRecoveryPendingError());
    const result = await changePassword();

    expect(result).toMatchObject({ status: "ERROR", message: expect.stringContaining("กรุณาอย่าทำรายการซ้ำ") });
    expect(result.message).toContain("รอผู้ดูแลระบบตรวจสอบ");
    expect(result.message).not.toContain("ลองอีกครั้ง");
    expect(result.message).not.toMatch(sensitive);
  });

  it("reports an uncertain outcome distinctly and never as success or a plain failure", async () => {
    vi.mocked(changeAuthenticatedUserPassword).mockRejectedValue(new PasswordChangeOutcomeUncertainError());
    const result = await changePassword();

    expect(result).toEqual({
      status: "OUTCOME_UNCERTAIN",
      message: "ยังยืนยันผลการเปลี่ยนรหัสผ่านไม่ได้ กรุณาอย่าทำรายการซ้ำ และติดต่อผู้ดูแลระบบเพื่อตรวจสอบสถานะบัญชี",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(result.message).not.toMatch(sensitive);
  });

  it("keeps unexpected infrastructure failures generic", async () => {
    vi.mocked(changeAuthenticatedUserPassword).mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.5:5432 operation 11111111-2222-4333-8444-555555555555"),
    );
    const result = await changePassword();

    expect(result).toEqual({ status: "ERROR", message: "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง" });
    expect(result.message).not.toMatch(sensitive);
  });
});
