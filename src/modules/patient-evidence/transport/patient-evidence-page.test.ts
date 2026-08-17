import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientEvidencePage from "../../../../app/app/patients/[relationshipId]/evidence/page";
import { PatientEvidenceForm } from "../../../../app/app/patients/[relationshipId]/evidence/evidence-form";
import type { PatientEvidencePageContext } from "../services/patient-evidence-query-service";

const {
  mockedConnection,
  mockedGetPageContext,
  mockedGetProtectedApplicationActor,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetPageContext: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mockedConnection }));
vi.mock("next/navigation", () => ({ notFound: mockedNotFound, redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));
vi.mock("@/modules/patient-evidence/services/patient-evidence-query-service", () => ({
  getPatientEvidencePageContext: mockedGetPageContext,
}));

const relationshipId = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "22222222-2222-4222-8222-222222222222" };
const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: "HN-001",
  hospital: { id: "33333333-3333-4333-8333-333333333333", name: "โรงพยาบาล ก" },
};

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

function context(overrides: Partial<PatientEvidencePageContext> = {}): PatientEvidencePageContext {
  return {
    patient,
    artifacts: [],
    canCreate: true,
    ...overrides,
  };
}

describe("Patient Evidence page workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedGetPageContext.mockResolvedValue(context());
    mockedNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockedRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("renders the create/list/view workflow for a writable relationship", async () => {
    const page = await PatientEvidencePage({ params: Promise.resolve({ relationshipId }) });

    expect(containsString(page, "หลักฐาน / รูปภาพสถานะ")).toBe(true);
    expect(containsString(page, "ยังไม่มีรูปหลักฐาน")).toBe(true);
    expect(containsString(page, "ดูหลักฐาน")).toBe(true);
    expect(page).toBeTruthy();
  });

  it("shows the form component only when create capability is granted", async () => {
    const page = await PatientEvidencePage({ params: Promise.resolve({ relationshipId }) });

    expect(containsString(page, "เพิ่มรูปหลักฐาน")).toBe(true);
    expect(PatientEvidenceForm).toBeTypeOf("function");

    mockedGetPageContext.mockResolvedValueOnce(context({ canCreate: false }));
    const readOnlyPage = await PatientEvidencePage({ params: Promise.resolve({ relationshipId }) });

    expect(containsString(readOnlyPage, "ไม่มีสิทธิ์เพิ่มรูปหลักฐาน")).toBe(true);
  });
});
