import { IdentityAssurance, MembershipStatus, UserStatus, UserTakeoverProviderState } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getActor: vi.fn(),
  getDetail: vi.fn(),
  getWorkforceDetail: vi.fn(),
  getRecoveryEligibility: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getActor,
}));
vi.mock("@/modules/user-management/services/user-directory-service", () => ({
  getHospitalUserDetail: mocks.getDetail,
}));
vi.mock("@/modules/workforce/services/workforce-service", () => ({
  getWorkforceDetail: mocks.getWorkforceDetail,
}));
vi.mock("@/modules/account-security/services/mediated-password-reset-service", () => ({
  getMediatedPasswordResetEligibility: mocks.getRecoveryEligibility,
}));
vi.mock("../../../patients/patient-care-end-form", () => ({ PatientCareEndForm: () => null }));
vi.mock("../../../patients/patient-name-correction-form", () => ({ PatientNameCorrectionForm: () => null }));
vi.mock("../../../workforce/[kind]/[relationshipId]/workforce-management-controls", () => ({
  WorkforceManagementControls: () => null,
}));
vi.mock("./user-record-delete-control", () => ({ UserRecordDeleteControl: () => null }));
vi.mock("./user-takeover-control", () => ({ UserTakeoverControl: () => null }));
vi.mock("../../mediated-password-reset-control", () => ({ MediatedPasswordResetControl: () => null }));

import type { UserDetail } from "@/modules/user-management/services/user-directory-service";
import UserDetailPage from "./page";

function takeoverLockedPatient(identityAssurance: IdentityAssurance): UserDetail {
  const at = new Date("2026-11-04T05:00:00.000Z");
  return {
    contactPhone: null,
    kind: "patient",
    relationshipId: "patient-relationship-1",
    hospital: { id: "hospital-1", name: "โรงพยาบาลชุมชน" },
    userId: "user-1",
    displayName: "สมพร ใจดี",
    givenName: "สมพร",
    familyName: "ใจดี",
    personVersion: 1,
    hospitalNumber: null,
    status: "SUSPENDED",
    accountStatus: UserStatus.SUSPENDED,
    relationshipStatus: MembershipStatus.ACTIVE,
    identityAssurance,
    relationshipUpdatedAt: at.toISOString(),
    activation: {
      method: "SELF_REGISTERED",
      activatedAt: at,
      selfRegisteredAt: at,
      addedAt: at,
      addedByName: "เจ้าหน้าที่โรงพยาบาล",
    },
    takeoverLock: { lockedAt: at, providerState: UserTakeoverProviderState.RECONCILIATION_REQUIRED },
    timeline: [],
    deletionBlockers: [],
    singleHospital: false,
    takeoverBlock: "LOCKED",
    legacyHref: "/app/patients/patient-relationship-1",
  };
}

describe("UserDetailPage provider reconciliation warning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getActor.mockResolvedValue({});
    mocks.getWorkforceDetail.mockResolvedValue(null);
    mocks.getRecoveryEligibility.mockResolvedValue("OWNER_ELIGIBLE");
  });

  it.each([
    ["hospital-verified", IdentityAssurance.HOSPITAL_PROOFED],
    ["caregiver-invitation", IdentityAssurance.CAREGIVER_INVITATION],
  ])("describes unconfirmed provider action accurately for %s accounts", async (_label, identityAssurance) => {
    mocks.getDetail.mockResolvedValue(takeoverLockedPatient(identityAssurance));

    const page = await UserDetailPage({
      params: Promise.resolve({ kind: "patient", relationshipId: "patient-relationship-1" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("บัญชีถูกระงับ");
    expect(markup).toContain("ยังยืนยันการระงับการเข้าสู่ระบบผ่านบริการภายนอกไม่ได้");
    expect(markup).not.toContain("ออกจากระบบทุกอุปกรณ์");
  });
});
