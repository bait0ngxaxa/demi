import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HospitalStatus, MembershipStatus, MembershipType, PatientProgramStatus, Role } from "@prisma/client";

import Link from "next/link";
import PatientDetailPage from "../../../../app/app/patients/[relationshipId]/page";
import { PatientProfileView } from "../../../../app/app/patients/[relationshipId]/patient-profile-view";
import { PatientHealthHistorySection } from "../../../../app/app/patients/[relationshipId]/patient-health-history-section";
import { PatientSelfMeasurementSection } from "../../../../app/app/patients/[relationshipId]/patient-self-measurement-section";
import { PatientClassificationView } from "../../../../app/app/patients/[relationshipId]/patient-classification-view";
import { PatientAccountRecoveryPanel } from "../../../../app/app/patients/[relationshipId]/account-recovery-panel";
import { PatientProgramOpenControl } from "../../../../app/app/patients/[relationshipId]/programs/program-mutation-controls";
import { PatientProgramView } from "../../../../app/app/patients/[relationshipId]/programs/patient-program-view";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { ProgramRoundsOverview, RoundSummary } from "@/modules/patient-program-rounds/services/round-query-service";
import type { PatientProgramPageContext, PatientProgramProjection } from "@/modules/patient-program/services/patient-program-query-service";
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

const {
  mockedConnection,
  mockedGetPatientBaselineNavigationState,
  mockedGetPatientClassificationPageContext,
  mockedGetPatientDirectoryDetail,
  mockedGetPatientProgramPageContext,
  mockedGetProgramRoundsOverview,
  mockedGetProtectedApplicationActor,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetPatientBaselineNavigationState: vi.fn(),
  mockedGetPatientClassificationPageContext: vi.fn(),
  mockedGetPatientDirectoryDetail: vi.fn(),
  mockedGetPatientProgramPageContext: vi.fn(),
  mockedGetProgramRoundsOverview: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mockedConnection }));
vi.mock("next/navigation", () => ({ notFound: mockedNotFound, redirect: mockedRedirect }));
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
vi.mock("@/modules/patient-program-rounds/services/round-query-service", () => ({
  getProgramRoundsOverview: mockedGetProgramRoundsOverview,
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
  classification: null,
  selfRegisteredAt: null,
  access: "DIRECT" as const,
  profile: {
    dateOfBirth: new Date("1977-01-01T00:00:00.000Z"),
    gender: "ชาย",
    phoneNumber: "0812345678",
    addressText: "99 ถนนตัวอย่าง แขวงตัวอย่าง",
    emergencyContactName: "สมหญิง ผู้ติดต่อ",
    emergencyContactRelationship: "พี่สาว",
    emergencyContactPhone: "0898765432",
    occupation: "เกษตรกร",
    educationLevel: "มัธยมศึกษา",
  },
  profileSource: "LEGACY_FALLBACK" as const,
};

const patientSummary = {
  patientProfileId: patient.patientProfileId,
  patientHospitalRelationshipId: patient.patientHospitalRelationshipId,
  displayName: patient.displayName,
  hospital: patient.hospital,
  hospitalNumber: patient.hospitalNumber,
  classification: null,
  selfRegisteredAt: null,
  access: "DIRECT" as const,
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

type PageElementProps = {
  children?: ReactNode;
  id?: string;
  className?: string;
  href?: string;
  variant?: "primary" | "secondary";
  relationshipId?: string;
  label?: string;
  "aria-current"?: string;
};

const expandedPageComponents = new Set([
  "CompletedPatientPrograms",
  "HistoryTab",
  "PatientNextStepPanel",
  "PatientProgramView",
  "PatientSummary",
]);

function containsString(value: unknown, needle: string, seen = new Set<object>()): boolean {
  if (typeof value === "string") return value.includes(needle);
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  if (isValidElement(value)) {
    return elements(value).some((element) => containsString(element.props, needle, seen));
  }
  if (Array.isArray(value)) return value.some((item) => containsString(item, needle, seen));
  return Object.values(value).some((item) => containsString(item, needle, seen));
}

function elements(node: ReactNode): ReactElement<PageElementProps>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<PageElementProps>(child)) return [];
    const componentName = typeof child.type === "function" ? child.type.name : "";
    const nested = typeof child.type === "function" && expandedPageComponents.has(componentName)
      ? (child.type as (props: PageElementProps) => ReactNode)(child.props)
      : child.props.children;
    return [child, ...elements(nested)];
  });
}

function primaryActionCount(node: ReactNode): number {
  return elements(node).filter((element) =>
    element.props.className?.includes("bg-action-primary") ||
    (element.type === PatientProgramOpenControl && element.props.variant === "primary"),
  ).length;
}

function roundOverview(
  states: readonly RoundSummary["state"][] = ["NOT_STARTED", "LOCKED", "LOCKED", "LOCKED", "LOCKED", "LOCKED"],
  after: ProgramRoundsOverview["after"]["state"] = "LOCKED",
): ProgramRoundsOverview & { patientDisplayName: string } {
  return {
    patientHospitalRelationshipId: patient.patientHospitalRelationshipId,
    patientProgramId: "current-program",
    patientDisplayName: patient.displayName,
    programStatus: PatientProgramStatus.ACTIVE,
    rounds: states.map((state, index) => ({
      roundNumber: (index + 1) as RoundSummary["roundNumber"],
      title: `ครั้งที่ ${index + 1}`,
      state,
      resolvedItems: state === "COMPLETED" ? 2 : 0,
      totalItems: 2,
      completedAt: null,
      completedByDisplayName: null,
    })),
    after: { state: after, date: null, recordedByDisplayName: null },
  };
}

function programProjection(
  status: PatientProgramProjection["status"] = PatientProgramStatus.ACTIVE,
  programId = "current-program",
): PatientProgramProjection {
  return {
    programId,
    patientHospitalRelationshipId: patient.patientHospitalRelationshipId,
    status,
    startedAt: new Date("2026-08-01T00:00:00.000Z"),
    completedAt: status === PatientProgramStatus.COMPLETED ? new Date("2026-08-18T00:00:00.000Z") : null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    createdBy: { id: actor.userId, displayName: "ผู้บันทึก" },
    initialBaseline: null,
  };
}

function programContext(overrides: Partial<PatientProgramPageContext> = {}): PatientProgramPageContext {
  return {
    patient: {
      patientHospitalRelationshipId: patient.patientHospitalRelationshipId,
      displayName: patient.displayName,
      hospitalNumber: patient.hospitalNumber,
      hospital: patient.hospital,
    },
    active: null,
    latest: null,
    history: [],
    canOpen: true,
    canManage: true,
    ...overrides,
  };
}

async function renderPage(tab?: string): Promise<React.JSX.Element> {
  return PatientDetailPage({
    params: Promise.resolve({ relationshipId: patient.patientHospitalRelationshipId }),
    searchParams: Promise.resolve({ tab }),
  });
}

function expectActiveTab(page: React.JSX.Element, label: string): void {
  const activeTab = elements(page).find((element) =>
    element.type === Link &&
    containsString(element.props.children, label) &&
    element.props["aria-current"] === "page",
  );
  expect(activeTab).toBeDefined();
}

describe("Patient detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedGetPatientDirectoryDetail.mockResolvedValue(patientSummary);
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
    mockedGetPatientProgramPageContext.mockResolvedValue(programContext());
    mockedGetProgramRoundsOverview.mockResolvedValue(roundOverview());
    mockedNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockedRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("passes the opaque relationship ID to the independently authorized service", async () => {
    const page = await renderPage();

    expect(mockedGetPatientDirectoryDetail).toHaveBeenCalledWith(
      expect.anything(),
      patient.patientHospitalRelationshipId,
      {},
      { includeProfile: false },
    );
    expect(page).toBeDefined();
  });

  it("renders the selected Patient Profile fields only in the profile tab", async () => {
    mockedGetPatientDirectoryDetail.mockResolvedValue(patient);
    const page = await renderPage("profile");
    const profileView = PatientProfileView({ profile: patient.profile, profileSource: patient.profileSource });

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
      "พี่สาว",
      "เกษตรกร",
      "มัธยมศึกษา",
    ]) {
      expect(containsString(profileView, value)).toBe(true);
    }
    expect(containsString(page, "0812345678")).toBe(true);
    expect(elements(page).some((element) => element.type === PatientHealthHistorySection)).toBe(true);
    expect(elements(page).some((element) => element.type === PatientSelfMeasurementSection)).toBe(true);
    expect(elements(page).some((element) => element.type === PatientClassificationView)).toBe(true);
    expect(mockedGetPatientDirectoryDetail).toHaveBeenCalledWith(
      expect.anything(),
      patient.patientHospitalRelationshipId,
      {},
      { includeProfile: true },
    );
    expect(mockedGetPatientClassificationPageContext).toHaveBeenCalledWith(
      expect.anything(),
      patient.patientHospitalRelationshipId,
      undefined,
      { includeHistory: true },
    );
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
        emergencyContactRelationship: null,
        emergencyContactPhone: null,
        occupation: null,
        educationLevel: null,
      },
    });

    const page = await renderPage("profile");
    const profileView = PatientProfileView({
      profile: {
        dateOfBirth: null,
        gender: null,
        phoneNumber: null,
        addressText: null,
        emergencyContactName: null,
        emergencyContactRelationship: null,
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

  it("shows Baseline status and recommends recording it without blocking Program opening", async () => {
    const page = await renderPage();

    expect(containsString(page, "ข้อมูลตั้งต้น")).toBe(true);
    expect(containsString(page, "ยังไม่มีข้อมูลตั้งต้น")).toBe(true);
    expect(containsString(page, "แนะนำให้บันทึกข้อมูลตั้งต้น แต่สามารถเปิดโปรแกรมได้โดยไม่ต้องมีข้อมูลตั้งต้น")).toBe(true);
    expect(containsString(page, "บันทึกข้อมูลตั้งต้น")).toBe(true);
    expect(primaryActionCount(page)).toBe(1);
    expect(elements(page).some((element) => element.type === PatientProgramOpenControl && element.props.variant === "secondary")).toBe(true);
    expect(mockedGetPatientBaselineNavigationState).toHaveBeenCalledWith(
      expect.anything(),
      patient.patientHospitalRelationshipId,
    );
  });

  it("shows an existing Baseline in the ordered history list", async () => {
    mockedGetPatientBaselineNavigationState.mockResolvedValue({
      baseline: { recordedOn: new Date("2026-08-01T00:00:00.000Z") },
      canCreate: true,
    });

    const page = await renderPage("history");

    expect(containsString(page, "ดูข้อมูลตั้งต้น")).toBe(true);
    expect(containsString(page, "บันทึกเมื่อ")).toBe(true);
    expect(containsString(page, "1 สิงหาคม 2569")).toBe(true);
    expect(containsString(page, "บันทึกข้อมูลตั้งต้น")).toBe(false);
  });

  it("keeps unavailable Baseline creation neutral and shows all history destinations", async () => {
    mockedGetPatientBaselineNavigationState.mockResolvedValue({ baseline: null, canCreate: false });

    const page = await renderPage("history");

    expect(containsString(page, `/app/patients/${patient.patientHospitalRelationshipId}/baseline`)).toBe(false);
    for (const destination of ["appointments", "screenings", "goals", "followups", "evidence"]) {
      expect(containsString(page, `/app/patients/${patient.patientHospitalRelationshipId}/${destination}`)).toBe(true);
    }
    expect(mockedGetPatientProgramPageContext).toHaveBeenCalledWith(
      expect.anything(),
      patient.patientHospitalRelationshipId,
      undefined,
      { includeHistory: true },
    );
  });

  it("shows completed Programs inline and read-only in the history tab", async () => {
    const completed = programProjection(PatientProgramStatus.COMPLETED, "completed-program");
    mockedGetPatientProgramPageContext.mockResolvedValue(programContext({
      active: null,
      latest: completed,
      history: [completed],
      canOpen: true,
      canManage: true,
    }));
    mockedGetProgramRoundsOverview.mockResolvedValue({
      ...roundOverview(["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED"], "RECORDED"),
      patientProgramId: "completed-program",
      programStatus: PatientProgramStatus.COMPLETED,
    });

    const page = await renderPage("history");

    expect(containsString(page, "โปรแกรมที่จบแล้ว · อ่านอย่างเดียว")).toBe(true);
    expect(containsString(page, "/programs/completed-program")).toBe(true);
    expect(containsString(page, "ดูโปรแกรมที่จบแล้ว")).toBe(true);
    expect(primaryActionCount(page)).toBe(1);
    expect(containsString(page, "เสร็จสิ้นแล้ว")).toBe(true);
    expect(containsString(page, "จัดบริการแล้ว 6/6")).toBe(true);
  });

  it("uses the active Program summary without implying a Baseline prerequisite", async () => {
    const active = programProjection();
    mockedGetPatientBaselineNavigationState.mockResolvedValue({ baseline: null, canCreate: false });
    mockedGetPatientProgramPageContext.mockResolvedValue(programContext({
      active,
      latest: active,
      history: [],
      canOpen: false,
      canManage: true,
    }));

    const page = await renderPage();

    expect(containsString(page, "กำลังดำเนินการ")).toBe(true);
    expect(containsString(page, "เริ่มครั้งที่ 1")).toBe(true);
    expect(containsString(page, "จัดบริการแล้ว 0/6")).toBe(true);
    expect(containsString(page, "สถานะผู้ป่วย")).toBe(true);
    expect(containsString(page, "ข้อมูลตั้งต้นแนะนำสำหรับการดูแล แต่ไม่ใช่เงื่อนไขของการเปิดโปรแกรม")).toBe(true);
    expect(containsString(page, "/rounds/1")).toBe(true);
    expect(containsString(page, "ไม่จำเป็นต้องทำตามลำดับ")).toBe(false);
    for (const anchor of ["#program-service-one", "#program-goals", "#program-followups", "#program-final"]) {
      expect(containsString(page, anchor)).toBe(false);
    }
    expect(elements(page).filter((element) => element.type === PatientProgramView)).toHaveLength(1);
  });

  it.each([
    {
      label: "NOT_STARTED round",
      states: ["NOT_STARTED", "LOCKED", "LOCKED", "LOCKED", "LOCKED", "LOCKED"] as const,
      after: "LOCKED" as const,
      expectedLabel: "เริ่มครั้งที่ 1",
      expectedHref: "/rounds/1",
    },
    {
      label: "IN_PROGRESS round",
      states: ["COMPLETED", "IN_PROGRESS", "LOCKED", "LOCKED", "LOCKED", "LOCKED"] as const,
      after: "LOCKED" as const,
      expectedLabel: "ทำงานต่อจากครั้งที่ 2",
      expectedHref: "/rounds/2",
    },
    {
      label: "unrecorded After after six completed rounds",
      states: ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED"] as const,
      after: "NOT_RECORDED" as const,
      expectedLabel: "บันทึก After",
      expectedHref: "#program-final",
    },
    {
      label: "recorded After",
      states: ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED"] as const,
      after: "RECORDED" as const,
      expectedLabel: "ไปยังโปรแกรมเพื่อจบโปรแกรม",
      expectedHref: "/programs/current-program",
    },
  ])("renders exactly one primary next step for an $label", async ({ states, after, expectedLabel, expectedHref }) => {
    const active = programProjection();
    mockedGetPatientProgramPageContext.mockResolvedValue(programContext({
      active,
      latest: active,
      canOpen: false,
      canManage: true,
    }));
    mockedGetProgramRoundsOverview.mockResolvedValue(roundOverview(states, after));

    const page = await renderPage();

    expect(primaryActionCount(page)).toBe(1);
    expect(containsString(page, expectedLabel)).toBe(true);
    expect(containsString(page, expectedHref)).toBe(true);
    expect(containsString(page, `จัดบริการแล้ว ${states.filter((state) => state === "COMPLETED").length}/6`)).toBe(true);
  });

  it.each([new InfrastructureError("rounds unavailable"), new NotFoundError(), new ForbiddenError()])("falls back to the rounds overview when its summary cannot be loaded (%s)", async (error) => {
    const active = programProjection();
    mockedGetPatientProgramPageContext.mockResolvedValue(programContext({
      active,
      latest: active,
      canOpen: false,
      canManage: true,
    }));
    mockedGetProgramRoundsOverview.mockRejectedValue(error);

    const page = await renderPage();

    expect(primaryActionCount(page)).toBe(1);
    expect(containsString(page, "ดูการจัดบริการทั้งหมด")).toBe(true);
    expect(containsString(page, "ยังโหลดความคืบหน้ารอบไม่ได้")).toBe(true);
    expect(containsString(page, "/programs/current-program/rounds")).toBe(true);
    expect(mockedNotFound).not.toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("renders the existing Program open control as the only primary action when Baseline is not actionable", async () => {
    mockedGetPatientBaselineNavigationState.mockResolvedValue({ baseline: null, canCreate: false });
    mockedGetPatientProgramPageContext.mockResolvedValue(programContext({ canOpen: true, canManage: true }));

    const page = await renderPage();

    expect(primaryActionCount(page)).toBe(1);
    expect(elements(page).filter((element) => element.type === PatientProgramOpenControl && element.props.variant === "primary")).toHaveLength(1);
  });

  it("shows the shared patient-level classification explanation in the profile tab", async () => {
    mockedGetPatientDirectoryDetail.mockResolvedValue(patient);
    const page = await renderPage("profile");

    expect(elements(page).some((element) => element.type === PatientClassificationView)).toBe(true);
    expect(containsString(page, "สถานะนี้เป็นสถานะปัจจุบันของผู้ป่วยและใช้ร่วมกันทุกโรงพยาบาลที่ดูแลผู้ป่วยรายนี้")).toBe(true);
    expect(primaryActionCount(page)).toBe(1);
  });

  it("loads no history or profile data on the overview tab and keeps the patient-care anchor", async () => {
    const page = await renderPage();

    expect(elements(page).some((element) => element.type === PatientProfileView)).toBe(false);
    expect(elements(page).some((element) => element.type === PatientHealthHistorySection)).toBe(false);
    expect(elements(page).some((element) => element.type === PatientSelfMeasurementSection)).toBe(false);
    expect(elements(page).some((element) => element.type === PatientClassificationView)).toBe(false);
    expect(elements(page).some((element) => element.type === PatientAccountRecoveryPanel)).toBe(false);
    expect(containsString(page, patient.profile.phoneNumber)).toBe(false);
    expect(elements(page).some((element) => element.props.id === "patient-care")).toBe(true);
    expect(mockedGetPatientDirectoryDetail).toHaveBeenCalledWith(expect.anything(), patient.patientHospitalRelationshipId, {}, { includeProfile: false });
    expect(mockedGetPatientClassificationPageContext).toHaveBeenCalledWith(expect.anything(), patient.patientHospitalRelationshipId, undefined, { includeHistory: false });
    expect(mockedGetPatientProgramPageContext).toHaveBeenCalledWith(expect.anything(), patient.patientHospitalRelationshipId, undefined, { includeHistory: false });
  });

  it("falls back to overview for an invalid tab", async () => {
    const page = await renderPage("not-a-tab");

    expectActiveTab(page, "ภาพรวม");
    expect(elements(page).some((element) => element.props.id === "patient-care")).toBe(true);
    expect(elements(page).some((element) => element.type === PatientProfileView)).toBe(false);
    expect(mockedGetPatientDirectoryDetail).toHaveBeenCalledWith(expect.anything(), patient.patientHospitalRelationshipId, {}, { includeProfile: false });
  });

  it("keeps the selected Hospital directory for multi-role users with Patient self-access", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({ ...actor, roles: [Role.HOSPITAL, Role.OSM, Role.PATIENT] });
    const page = await renderPage();

    expect(containsString(page, `/app/patients?hospitalId=${patient.hospital.id}`)).toBe(true);
    expect(containsString(page, "รายชื่อผู้ป่วยของโรงพยาบาล")).toBe(true);
    expect(containsString(page, "/app/personal")).toBe(false);
  });

  it.each([[Role.OSM], [Role.OSM, Role.PATIENT]])("returns an authorized OSM with roles %j to the assigned directory and omits Owner operations", async (...roles) => {
    mockedGetProtectedApplicationActor.mockResolvedValue({
      ...actor,
      roles,
      hospitalMemberships: [],
      osmHospitalRelationships: [{
        hospitalId: patient.hospital.id,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      }],
    });
    const page = await renderPage();

    expect(containsString(page, "/app/patients/assigned")).toBe(true);
    expect(containsString(page, "ผู้ป่วยที่รับผิดชอบ")).toBe(true);
    expect(containsString(page, "/app/patients?hospitalId=")).toBe(false);
    expect(containsString(page, "/assignment")).toBe(false);
  });

  it("shows the network read-only alert and no write CTA", async () => {
    mockedGetPatientDirectoryDetail.mockResolvedValue({ ...patientSummary, access: "NETWORK" });
    mockedGetProtectedApplicationActor.mockResolvedValue({
      ...actor,
      hospitalMemberships: actor.hospitalMemberships.map((membership) => ({ ...membership, hospitalId: "parent-hospital" })),
    });
    mockedGetPatientBaselineNavigationState.mockResolvedValue({ baseline: null, canCreate: false });
    mockedGetPatientProgramPageContext.mockResolvedValue(programContext({ canOpen: true, canManage: true }));

    const page = await renderPage();

    expect(containsString(page, "ทุกการเปิดดูจะถูกบันทึกไว้")).toBe(true);
    expect(primaryActionCount(page)).toBe(0);
    expect(elements(page).some((element) => element.type === PatientProgramOpenControl)).toBe(false);
  });

  it("shows the Manage tab for an OWNER and its authorized controls", async () => {
    const page = await renderPage("manage");

    expectActiveTab(page, "จัดการ");
    expect(containsString(page, "/assignment")).toBe(true);
    expect(elements(page).some((element) => element.type === PatientAccountRecoveryPanel)).toBe(true);
  });

  it("hides the Manage tab and loads no management controls for a MEMBER", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({
      ...actor,
      hospitalMemberships: actor.hospitalMemberships.map((membership) => ({
        ...membership,
        membershipType: MembershipType.MEMBER,
      })),
    });
    const page = await renderPage("manage");

    expectActiveTab(page, "ภาพรวม");
    expect(containsString(page, "/assignment")).toBe(false);
    expect(elements(page).some((element) => element.type === PatientAccountRecoveryPanel)).toBe(false);
    expect(elements(page).some((element) => element.props.href?.includes("tab=manage"))).toBe(false);
  });

  it("exposes relationship-scoped Evidence in the single ordered history list", async () => {
    const page = await renderPage("history");

    expect(containsString(page, "หลักฐาน/รูปภาพ")).toBe(true);
    expect(containsString(page, "ดูหลักฐาน")).toBe(true);
    expect(containsString(page, `/app/patients/${patient.patientHospitalRelationshipId}/evidence`)).toBe(true);
    expect(elements(page).filter((element) => element.type === "ol")).toHaveLength(1);
  });

  it("shows assignment management only for a Hospital OWNER", async () => {
    const ownerPage = await renderPage("manage");
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
    const memberPage = await renderPage("manage");
    expect(containsString(memberPage, "/assignment")).toBe(false);
  });

  it("starts Baseline and Program context loads while classification is still pending", async () => {
    let releaseClassification = (): void => {};
    const gate = new Promise<void>((resolve) => { releaseClassification = resolve; });
    mockedGetPatientClassificationPageContext.mockImplementationOnce(async () => {
      await gate;
      return {
        patient: {
          patientProfileId: patient.patientProfileId,
          patientHospitalRelationshipId: patient.patientHospitalRelationshipId,
          displayName: patient.displayName,
          hospitalName: patient.hospital.name,
        },
        current: null,
        history: [],
        canManage: true,
      };
    });
    const loading = renderPage();
    try {
      await vi.waitFor(() => {
        expect(mockedGetPatientBaselineNavigationState).toHaveBeenCalledOnce();
        expect(mockedGetPatientProgramPageContext).toHaveBeenCalledOnce();
      });
    } finally {
      releaseClassification();
    }
    expect(await loading).toBeDefined();
  });

  describe.each([
    ["classification", mockedGetPatientClassificationPageContext],
    ["baseline", mockedGetPatientBaselineNavigationState],
    ["program", mockedGetPatientProgramPageContext],
  ] as const)("%s context authorization", (_name, load) => {
    it("keeps NotFound mapped to the safe not-found path", async () => {
      load.mockRejectedValueOnce(new NotFoundError());
      await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mockedNotFound).toHaveBeenCalledOnce();
    });

    it("keeps Forbidden mapped to the application redirect", async () => {
      load.mockRejectedValueOnce(new ForbiddenError());
      await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT");
      expect(mockedRedirect).toHaveBeenCalledWith("/app");
    });
  });

  it("uses the safe not-found path for an inaccessible Hospital relationship", async () => {
    mockedGetPatientDirectoryDetail.mockRejectedValue(new NotFoundError());

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockedNotFound).toHaveBeenCalledOnce();
  });

  it("does not render a detail page when the actor is forbidden", async () => {
    mockedGetPatientDirectoryDetail.mockRejectedValue(new ForbiddenError());

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockedRedirect).toHaveBeenCalledWith("/app");
  });
});
