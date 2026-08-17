import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientBaselinePage from "../../../../app/app/patients/[relationshipId]/baseline/page";
import { PatientBaselineForm } from "../../../../app/app/patients/[relationshipId]/baseline/baseline-form";
import { PatientBaselineView } from "../../../../app/app/patients/[relationshipId]/baseline/baseline-view";
import type { PatientBaselinePageContext } from "../services/patient-baseline-query-service";

const {
  mockedConnection,
  mockedGetPatientBaselinePageContext,
  mockedGetProtectedApplicationActor,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetPatientBaselinePageContext: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mockedConnection }));
vi.mock("next/navigation", () => ({ notFound: mockedNotFound, redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));
vi.mock("@/modules/patient-baseline/services/patient-baseline-query-service", () => ({
  getPatientBaselinePageContext: mockedGetPatientBaselinePageContext,
}));

const relationshipId = "11111111-1111-4111-8111-111111111111";
const baselineId = "22222222-2222-4222-8222-222222222222";
const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: null,
  hospital: { id: "33333333-3333-4333-8333-333333333333", name: "โรงพยาบาล ก" },
};
const baseline = {
  id: baselineId,
  patientHospitalRelationshipId: relationshipId,
  recordedOn: new Date("2026-08-17T00:00:00.000Z"),
  recorder: { id: "44444444-4444-4444-8444-444444444444", displayName: "ผู้บันทึก" },
  measurements: {
    weight: null,
    waistCircumference: null,
    bloodPressureSystolic: null,
    bloodPressureDiastolic: null,
    bloodSugarDtx: null,
  },
  adaptation: { summary: null, obstacles: null, opportunities: null },
  confidence: { score: null, improvementPlan: null },
  summary: null,
  recommendations: null,
  createdAt: new Date("2026-08-17T05:00:00.000Z"),
};
const actor = { userId: "55555555-5555-4555-8555-555555555555" };

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

function context(overrides: Partial<PatientBaselinePageContext> = {}): PatientBaselinePageContext {
  return {
    patient,
    baseline: null,
    canCreate: true,
    ...overrides,
  };
}

describe("Patient Baseline page workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedGetPatientBaselinePageContext.mockResolvedValue(context());
    mockedNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockedRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("offers the creation workflow only when the relationship has no Baseline", async () => {
    const page = await PatientBaselinePage({ params: Promise.resolve({ relationshipId }) });

    expect(page.type).toBe(PatientBaselineForm);
    expect(page.props).toMatchObject({ relationshipId, patient });
  });

  it("switches to the read-only snapshot when a Baseline exists", async () => {
    mockedGetPatientBaselinePageContext.mockResolvedValueOnce(context({ baseline }));

    const page = await PatientBaselinePage({ params: Promise.resolve({ relationshipId }) });

    expect(page.type).toBe(PatientBaselineView);
    expect(page.props).toMatchObject({ baseline, patient });
    expect(containsString(PatientBaselineView({ baseline, patient }), "ไม่ระบุ")).toBe(true);
    expect(containsString(PatientBaselineView({ baseline, patient }), "แก้ไข")).toBe(false);
    expect(containsString(PatientBaselineView({ baseline, patient }), "ลบ")).toBe(false);
  });

  it("keeps a read-only actor on the relationship page without exposing a create control", async () => {
    mockedGetPatientBaselinePageContext.mockResolvedValueOnce(context({ canCreate: false }));

    const page = await PatientBaselinePage({ params: Promise.resolve({ relationshipId }) });

    expect(containsString(page, "ยังไม่มีข้อมูลตั้งต้น")).toBe(true);
    expect(containsString(page, "ไม่มีสิทธิ์บันทึกข้อมูลตั้งต้น")).toBe(true);
  });
});
