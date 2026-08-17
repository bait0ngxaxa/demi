import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedUseActionState = vi.hoisted(() => vi.fn());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useActionState: mockedUseActionState,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/modules/patient-baseline/transport/server-actions", () => ({
  createPatientBaselineAction: vi.fn(),
}));

import { PatientBaselineForm } from "../../../../app/app/patients/[relationshipId]/baseline/baseline-form";

const relationshipId = "11111111-1111-4111-8111-111111111111";

const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: "HN-001",
  hospital: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "โรงพยาบาล ก",
  },
};

function findInputMarkup(markup: string, id: string): string {
  return markup.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`, "u"))?.[0] ?? "";
}

describe("Patient Baseline form constraints", () => {
  beforeEach(() => {
    mockedUseActionState.mockReturnValue([{ status: "IDLE" }, vi.fn(), false]);
  });

  it("uses a positive technical minimum for every optional measurement", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientBaselineForm, { patient, relationshipId }),
    );

    for (const id of [
      "baseline-weight",
      "baseline-waist",
      "baseline-blood-pressure-systolic",
      "baseline-blood-pressure-diastolic",
      "baseline-blood-sugar-dtx",
    ]) {
      expect(findInputMarkup(markup, id)).toContain('min="0.01"');
    }
  });
});
