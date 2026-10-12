import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";

import PatientDetailPage from "../../../../app/app/patients/[relationshipId]/page";
import { PatientProgramView } from "../../../../app/app/patients/[relationshipId]/programs/patient-program-view";
import { PatientProfileView } from "../../../../app/app/patients/[relationshipId]/patient-profile-view";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const {
  mockedConnection,
  mockedGetPatientBaselineNavigationState,
  mockedGetPatientClassificationPageContext,
  mockedGetPatientDirectoryDetail,
  mockedGetPatientProgramPageContext,
  mockedGetProtectedApplicationActor,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetPatientBaselineNavigationState: vi.fn(),
  mockedGetPatientClassificationPageContext: vi.fn(),
  mockedGetPatientDirectoryDetail: vi.fn(),
  mockedGetPatientProgramPageContext: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: mockedConnection,
}));

vi.mock("next/navigation", () => ({
  notFound: mockedNotFound,
  redirect: mockedRedirect,
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));

vi.mock("@/modules/patient-directory/services/patient-directory-query-service", () => ({
  getPatientDirectoryDetail: mockedGetPatientDirectoryDetail,
}));

vi.mock("@/modules/patient-baseline/services/patient-baseline-query-service", () => ({
  getPatientBaselineNavigationState: mockedGetPatientBaselineNavigationState,
}));

vi.mock("@/modules/patient-program/services/patient-program-query-service", () => ({
  getPatientProgramPageContext: mockedGetPatientProgramPageContext,
}));
vi.mock("@/modules/patient-classification/services/patient-classification-query-service", () => ({
  getPatientClassificationPageContext: mockedGetPatientClassificationPageContext,
}));

const patient = {
  patientProfileId: "11111111-1111-4111-8111-111111111111",
  patientHospitalRelationshipId: "22222222-2222-4222-8222-222222222222",
  displayName: "สมชาย ผู้ป่วย",
  hospital: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "โรงพยาบาล ก",
  },
  hospitalNumber: "HN-001",
  profile: {
    dateOfBirth: new Date("1977-01-01T00:00:00.000Z"),
    gender: "ชาย",
    phoneNumber: "0812345678",
    addressText: "99 ถนนตัวอย่าง แขวงตัวอย่าง",
    emergencyContactName: "สมหญิง ผู้ติดต่อ",
    emergencyContactPhone: "0898765432",
    occupation: "เกษตรกร",
    educationLevel: "มัธยมศึกษา",
  },
  profileSource: "LEGACY_FALLBACK" as const,
};

const actor = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId: patient.hospital.id,
      membershipType: MembershipType.OWNER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
} satisfies ActorContext;

function containsString(value: unknown, needle: string, seen = new Set<object>()): boolean {
  if (typeof value === "string") {
    return value.includes(needle);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsString(item, needle, seen));
  }

  return Object.values(value).some((item) => containsString(item, needle, seen));
}

function elements(node: ReactNode): ReactElement<{ children?: ReactNode; id?: string }>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; id?: string }>(child)) return [];
    return [child, ...elements(child.props.children)];
  });
}

describe("Patient detail page authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedGetPatientDirectoryDetail.mockResolvedValue(patient);
    mockedGetPatientBaselineNavigationState.mockResolvedValue({ baseline: null, canCreate: true });
    mockedGetPatientClassificationPageContext.mockResolvedValue({
      patient: {
        patientProfileId: patient.patientProfileId,
        patientHospitalRelationshipId: patient.patientHospitalRelationshipId,
        displayName: patient.displayName,
        hospitalName: patient.hospital.name,
      },
      current: null,
      history: [],
      canManage: true,
    });
    mockedGetPatientProgramPageContext.mockResolvedValue({
      patient: {
        patientHospitalRelationshipId: patient.patientHospitalRelationshipId,
        displayName: patient.displayName,
        hospitalNumber: patient.hospitalNumber,
        hospital: patient.hospital,
      },
      active: null,
      history: [],
      canOpen: true,
      canManage: true,
    });
    mockedNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockedRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("passes the opaque relationship ID to the independently authorized service", async () => {
    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });

    expect(mockedGetPatientDirectoryDetail).toHaveBeenCalledWith(
      expect.anything(),
      patient.patientHospitalRelationshipId,
    );
    expect(page).toBeDefined();
  });

  it("renders the selected Patient Profile fields as a read-only detail section", async () => {
    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });
    const profileView = PatientProfileView({
      profile: patient.profile,
      profileSource: patient.profileSource,
    });

    for (const value of [
      "ข้อมูลผู้ป่วย",
      "มาจากโปรไฟล์เดิม",
      "ข้อมูลทั่วไป",
      "วันเกิด",
      "1 มกราคม 2520",
      "ชาย",
      "0812345678",
      "99 ถนนตัวอย่าง แขวงตัวอย่าง",
      "สมหญิง ผู้ติดต่อ",
      "0898765432",
      "เกษตรกร",
      "มัธยมศึกษา",
    ]) {
      expect(containsString(profileView, value)).toBe(true);
    }
    expect(containsString(page, "0812345678")).toBe(true);
    expect(containsString(page, "แก้ไขข้อมูลโปรไฟล์")).toBe(false);
  });

  it("keeps the profile structure visible and uses the missing-value label", async () => {
    mockedGetPatientDirectoryDetail.mockResolvedValue({
      ...patient,
      profile: {
        dateOfBirth: null,
        gender: null,
        phoneNumber: null,
        addressText: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        occupation: null,
        educationLevel: null,
      },
    });

    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });
    const profileView = PatientProfileView({
      profile: {
        dateOfBirth: null,
        gender: null,
        phoneNumber: null,
        addressText: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        occupation: null,
        educationLevel: null,
      },
      profileSource: "HOSPITAL_LOCAL",
    });

    expect(containsString(profileView, "ข้อมูลทั่วไป")).toBe(true);
    expect(containsString(profileView, "ผู้ติดต่อกรณีฉุกเฉิน")).toBe(true);
    expect(containsString(profileView, "ไม่ระบุ")).toBe(true);
    expect(page).toBeDefined();
  });

  it("shows the Baseline creation entry point when no Baseline exists", async () => {
    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });

    expect(containsString(page, "ข้อมูลตั้งต้น")).toBe(true);
    expect(containsString(page, "ยังไม่มีข้อมูลตั้งต้น")).toBe(true);
    expect(containsString(page, "บันทึกข้อมูลตั้งต้น")).toBe(true);
    expect(mockedGetPatientBaselineNavigationState).toHaveBeenCalledWith(
      expect.anything(),
      patient.patientHospitalRelationshipId,
    );
  });

  it("shows an existing Baseline as read-only navigation", async () => {
    mockedGetPatientBaselineNavigationState.mockResolvedValue({
      baseline: { recordedOn: new Date("2026-08-01T00:00:00.000Z") },
      canCreate: true,
    });

    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });

    expect(containsString(page, "ดูข้อมูลตั้งต้น")).toBe(true);
    expect(containsString(page, "ข้อมูลอ่านอย่างเดียว")).toBe(true);
    expect(containsString(page, "บันทึกข้อมูลตั้งต้น")).toBe(false);
  });

  it("keeps unavailable Baseline creation neutral and preserves all supporting destinations", async () => {
    mockedGetPatientBaselineNavigationState.mockResolvedValue({ baseline: null, canCreate: false });
    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });

    expect(containsString(page, `/app/patients/${patient.patientHospitalRelationshipId}/baseline`)).toBe(false);
    expect(containsString(page, "บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลตั้งต้น")).toBe(true);
    for (const section of ["#patient-context", "#patient-care", "#patient-history"]) {
      expect(containsString(page, section)).toBe(true);
    }
    for (const destination of ["screenings", "goals", "followups", "appointments", "evidence", "assignment"]) {
      expect(containsString(page, `/app/patients/${patient.patientHospitalRelationshipId}/${destination}`)).toBe(true);
    }
  });

  it("suggests the authorized current Program without implying a mandatory Baseline prerequisite", async () => {
    mockedGetPatientBaselineNavigationState.mockResolvedValue({ baseline: null, canCreate: false });
    mockedGetPatientProgramPageContext.mockResolvedValue({
      patient,
      active: { programId: "current-program", status: "ACTIVE" },
      history: [],
      canOpen: false,
      canManage: true,
    });
    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });
    expect(containsString(page, "ทำงานต่อในโปรแกรมปัจจุบัน")).toBe(true);
    expect(containsString(page, "แนะนำให้บันทึกข้อมูลตั้งต้น")).toBe(false);
  });

  it.each([
    { label: "active Program with Baseline", active: true, baseline: true, canCreate: true, canOpen: false, first: "program" },
    { label: "active Program with permitted missing Baseline", active: true, baseline: false, canCreate: true, canOpen: false, first: "program" },
    { label: "no active Program with Baseline creation", active: false, baseline: false, canCreate: true, canOpen: true, first: "baseline" },
    { label: "no active Program with only Program creation", active: false, baseline: false, canCreate: false, canOpen: true, first: "program" },
    { label: "no creation permissions", active: false, baseline: false, canCreate: false, canOpen: false, first: "baseline" },
  ])("orders care entries for $label without duplicating paths", async ({ active, baseline, canCreate, canOpen, first }) => {
    mockedGetPatientBaselineNavigationState.mockResolvedValue({
      baseline: baseline ? { recordedOn: new Date("2026-08-01T00:00:00Z") } : null, canCreate,
    });
    mockedGetPatientProgramPageContext.mockResolvedValue({
      patient, active: active ? { programId: "current-program", status: "ACTIVE" } : null,
      history: [], canOpen, canManage: canOpen || active,
    });
    const page = await PatientDetailPage({ params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }) });
    const care = elements(page).find((element) => element.props.id === "patient-care");
    expect(care).toBeDefined();
    const entries = Children.toArray(care?.props.children).filter(isValidElement).slice(-2);
    expect(entries.map((entry) => entry.type === PatientProgramView ? "program" : "baseline")).toEqual(first === "program" ? ["program", "baseline"] : ["baseline", "program"]);
    expect(elements(page).filter((element) => element.type === PatientProgramView)).toHaveLength(1);
    expect(containsString(page, `/app/patients/${patient.patientHospitalRelationshipId}/baseline`)).toBe(baseline || canCreate);
    if (active) {
      expect(containsString(page, "ทำงานต่อในโปรแกรมปัจจุบัน")).toBe(true);
      expect(containsString(page, "แนะนำให้บันทึกข้อมูลตั้งต้น")).toBe(false);
    } else if (canCreate && !baseline) {
      expect(containsString(page, "แนะนำให้บันทึกข้อมูลตั้งต้น")).toBe(true);
    } else if (canOpen) {
      expect(containsString(page, "สามารถเปิดโปรแกรมการดูแลรอบใหม่")).toBe(true);
    } else {
      expect(containsString(page, "เลือกดูข้อมูลตั้งต้นและโปรแกรมการดูแลตามสิทธิ์ปัจจุบัน")).toBe(true);
    }
    if (active && canCreate && !baseline) {
      const baselineEntry = entries[1];
      const link = elements(baselineEntry).find((element) => containsString(element.props.children, "บันทึกข้อมูลตั้งต้น"));
      expect(link).toBeDefined();
      expect(containsString(link, "bg-action-primary")).toBe(false);
    }
  });

  it("explains shared patient-level classification outside the closed history disclosure", async () => {
    const page = await PatientDetailPage({ params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }) });
    const context = elements(page).find((element) => element.props.id === "patient-context");
    const identityPanel = Children.toArray(context?.props.children)[0];
    expect(containsString(identityPanel, "สถานะนี้เป็นข้อมูลระดับผู้ป่วย ใช้ร่วมกันในบริบทโรงพยาบาลที่เกี่ยวข้อง")).toBe(true);
    expect(containsString(page, "สถานะผู้ป่วยและประวัติการเปลี่ยนแปลง")).toBe(true);
  });

  it("retains the selected Hospital directory for multi-role users with Patient self-access", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({ ...actor, roles: [Role.HOSPITAL, Role.OSM, Role.PATIENT] });
    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });
    expect(containsString(page, `/app/patients?hospitalId=${patient.hospital.id}`)).toBe(true);
    expect(containsString(page, "/app/personal")).toBe(false);
  });

  it("returns an authorized OSM to the assigned directory and omits Owner operations", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({
      ...actor,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [{
        hospitalId: patient.hospital.id,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      }],
    });
    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });
    expect(containsString(page, "/app/patients/assigned")).toBe(true);
    expect(containsString(page, "/assignment")).toBe(false);
  });

  it("exposes the relationship-scoped Evidence entry point without changing profile behavior", async () => {
    const page = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });

    expect(containsString(page, "หลักฐาน / รูปภาพสถานะ")).toBe(true);
    expect(containsString(page, "ดูหลักฐานและรูปภาพที่เกี่ยวข้องกับการดูแลผู้ป่วยรายนี้")).toBe(true);
    expect(containsString(page, `/app/patients/${patient.patientHospitalRelationshipId}/evidence`)).toBe(true);
  });

  it("shows assignment management only for a Hospital OWNER", async () => {
    const ownerPage = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });
    expect(containsString(ownerPage, "/assignment")).toBe(true);

    mockedGetProtectedApplicationActor.mockResolvedValue({
      ...actor,
      hospitalMemberships: [
        {
          ...actor.hospitalMemberships[0],
          membershipType: MembershipType.MEMBER,
        },
      ],
    });
    const memberPage = await PatientDetailPage({
      params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    });
    expect(containsString(memberPage, "/assignment")).toBe(false);
  });

  it("uses the safe not-found path for an inaccessible Hospital relationship", async () => {
    mockedGetPatientDirectoryDetail.mockRejectedValue(new NotFoundError());

    await expect(
      PatientDetailPage({
        params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedNotFound).toHaveBeenCalledOnce();
  });

  it("does not render a detail page when the actor is forbidden", async () => {
    mockedGetPatientDirectoryDetail.mockRejectedValue(new ForbiddenError());

    await expect(
      PatientDetailPage({
        params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockedRedirect).toHaveBeenCalledWith("/app");
  });
});
