import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedUseActionState = vi.hoisted(() => vi.fn());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return { ...actual, useActionState: mockedUseActionState };
});
vi.mock("@/modules/account-security/transport/server-actions", () => ({
  changeAuthenticatedPasswordAction: vi.fn(),
  issuePatientAccountRecoveryAction: vi.fn(),
  checkPatientAccountRecoveryAction: vi.fn(),
  completePatientAccountRecoveryAction: vi.fn(),
}));
vi.mock("@/modules/patient-hospital-profile/transport/server-actions", () => ({
  updateOwnPatientHospitalProfileAction: vi.fn(),
}));

import { PasswordChangeForm } from "../../../../app/app/personal/password/password-change-form";
import { PatientAccountRecoveryPanel } from "../../../../app/app/patients/[relationshipId]/account-recovery-panel";
import { PatientHospitalProfileEditor } from "../../../../app/app/personal/profile/[relationshipId]/profile-editor";
import { PublicAccountRecoveryForm } from "../../../../app/recover/public-account-recovery-form";

const profile = {
  relationshipId: "11111111-1111-4111-8111-111111111111",
  hospitalName: "โรงพยาบาล ตัวอย่างชื่อยาวสำหรับตรวจการตัดบรรทัด",
  person: { givenName: "สมชาย", familyName: "ใจดี" },
  profile: {
    gender: "ชาย",
    phoneNumber: "0812345678",
    addressText: "99 ถนนสุขุมวิท",
    emergencyContactName: "สมหญิง",
    emergencyContactPhone: "0898765432",
    occupation: "เกษตรกร",
    educationLevel: "มัธยมศึกษา",
  },
  source: "LEGACY_FALLBACK" as const,
  version: 0,
};

describe("account security form presentation", () => {
  beforeEach(() => {
    mockedUseActionState.mockReturnValue([{ status: "IDLE" }, vi.fn(), false]);
  });

  it("renders only the approved Hospital-local profile fields and a legacy notice", () => {
    const markup = renderToStaticMarkup(createElement(PatientHospitalProfileEditor, { profile }));

    for (const field of [
      "gender",
      "phoneNumber",
      "addressText",
      "emergencyContactName",
      "emergencyContactPhone",
      "occupation",
      "educationLevel",
    ]) {
      expect(markup).toContain(`name="${field}"`);
    }
    expect(markup).toContain("ข้อมูลนี้ใช้สำหรับโรงพยาบาลนี้");
    expect(markup).toContain("ยังไม่ได้บันทึกแยกสำหรับโรงพยาบาลนี้");
    expect(markup).toContain('name="expectedVersion"');
    expect(markup).not.toContain("nationalId");
    expect(markup).not.toContain("วันเกิด");
    expect(markup).not.toContain("HN-001");
  });

  it("renders password change inputs without a target User or provider identity field", () => {
    const markup = renderToStaticMarkup(createElement(PasswordChangeForm));

    expect(markup).toContain('name="currentPassword"');
    expect(markup).toContain('name="newPassword"');
    expect(markup).toContain('name="passwordConfirmation"');
    expect(markup).toContain('minLength="12"');
    expect(markup).not.toContain("authSubject");
    expect(markup).not.toContain("providerAlias");
    expect(markup).not.toContain("targetUserId");
  });

  it("offers only the assisted Hospital recovery handoff", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientAccountRecoveryPanel, {
        relationshipId: profile.relationshipId,
      }),
    );

    expect(markup).toContain("ข้าพเจ้าได้ตรวจสอบตัวตน");
    expect(markup).toContain('name="nationalId"');
    expect(markup).toContain('name="nationalIdConfirmation"');
    expect(markup).toContain("บัญชี DEMI เดียว");
    expect(markup).not.toContain("อีเมล");
    expect(markup).not.toContain("SMS");
    expect(markup).not.toContain("LINE");
  });

  it("keeps the public recovery claimant message generic until the fragment is checked", () => {
    const markup = renderToStaticMarkup(createElement(PublicAccountRecoveryForm));

    expect(markup).toContain("ตั้งรหัสผ่านบัญชี DEMI ใหม่");
    expect(markup).toContain("กำลังตรวจสอบลิงก์");
    expect(markup).not.toContain('name="newPassword"');
    expect(markup).not.toContain("providerAlias");
  });
});
