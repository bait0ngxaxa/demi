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

import { CLINICAL_VALUE_LIMITS } from "@/shared/clinical/clinical-value-limits";

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

  it("bounds every optional measurement by the shared clinical limits", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientBaselineForm, { patient, relationshipId }),
    );

    for (const [id, kind] of [
      ["baseline-weight", "weight"],
      ["baseline-height-cm", "height"],
      ["baseline-waist", "waistCircumference"],
      ["baseline-blood-pressure-systolic", "systolicBloodPressure"],
      ["baseline-blood-pressure-diastolic", "diastolicBloodPressure"],
      ["baseline-blood-sugar-dtx", "bloodSugar"],
      ["baseline-hba1c", "hba1c"],
    ] as const) {
      const input = findInputMarkup(markup, id);
      expect(input).toContain(`min="${CLINICAL_VALUE_LIMITS[kind].min}"`);
      expect(input).toContain(`max="${CLINICAL_VALUE_LIMITS[kind].max}"`);
    }
  });
});
