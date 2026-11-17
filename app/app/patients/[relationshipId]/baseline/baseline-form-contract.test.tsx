// @vitest-environment jsdom
// Form ↔ server contract: the Baseline form posts exactly what PATIENT_BASELINE_FORM_FIELDS,
// buildSubmissionInput and patientBaselineCreateRequestSchema accept.
import { beforeAll, describe, expect, it, vi } from "vitest";

import { patientBaselineCreateRequestSchema } from "@/modules/patient-baseline/schemas/patient-baseline-schemas";
import {
  buildSubmissionInput,
  PATIENT_BASELINE_FORM_FIELDS,
} from "@/modules/patient-baseline/transport/server-action-helpers";

import {
  captureSubmittedFormData,
  expectFormContract,
  findButton,
  installFormContractEnvironment,
  setFieldValue,
  submitForm,
} from "../../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-baseline/transport/server-actions", () => ({ createPatientBaselineAction: actions.create }));

import { PatientBaselineForm } from "./baseline-form";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: "HN-001",
  hospital: { id: "22222222-2222-4222-8222-222222222222", name: "โรงพยาบาล ก" },
};

beforeAll(() => {
  installFormContractEnvironment();
});

function confirmFromReview(container: HTMLElement): void {
  const form = container.querySelector("form");
  submitForm(form, findButton(container, "ตรวจสอบข้อมูลก่อนบันทึก"));
  submitForm(form, findButton(document.body, "ยืนยันบันทึกข้อมูลตั้งต้น"));
}

describe("Baseline form ↔ createPatientBaselineAction", () => {
  it("posts every baseline field after the review confirmation", async () => {
    actions.create.mockResolvedValue({ status: "IDLE" });
    const values: Record<string, string> = {
      recordedOn: "2026-11-01",
      weight: "72.4",
      heightCm: "168",
      waistCircumference: "90",
      bloodPressureSystolic: "132",
      bloodPressureDiastolic: "84",
      bloodSugarDtx: "118",
      hba1c: "6.8",
      cvdRiskScore: "12",
      adaptationSummary: "เริ่มปรับอาหารเช้า",
      adaptationObstacles: "ทำงานเป็นกะ",
      adaptationOpportunities: "ครอบครัวช่วยทำอาหาร",
      confidenceScore: "7",
      confidenceImprovementPlan: "ตั้งเป้าเดินหลังอาหารเย็น",
      summary: "ความดันสูงเล็กน้อย",
      recommendations: "ลดเค็ม เดินวันละ 30 นาที",
    };
    const payload = await captureSubmittedFormData({
      render: () => <PatientBaselineForm patient={patient} relationshipId={relationshipId} />,
      action: actions.create,
      interact: (container) => {
        for (const [name, value] of Object.entries(values)) {
          setFieldValue(container.querySelector(`[name="${name}"]`), value);
        }
        confirmFromReview(container);
      },
    });

    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(expectFormContract(payload, {
      fields: PATIENT_BASELINE_FORM_FIELDS,
      parse: buildSubmissionInput,
      schema: patientBaselineCreateRequestSchema,
    })).toMatchObject({ patientHospitalRelationshipId: relationshipId, weight: 72.4, hba1c: 6.8, confidenceScore: 7 });
  });

  it("posts the same keys with only a single measurement filled in", async () => {
    actions.create.mockResolvedValue({ status: "IDLE" });
    const payload = await captureSubmittedFormData({
      render: () => <PatientBaselineForm patient={patient} relationshipId={relationshipId} />,
      action: actions.create,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="recordedOn"]'), "2026-11-01");
        setFieldValue(container.querySelector('[name="weight"]'), "65");
        confirmFromReview(container);
      },
    });

    expect(expectFormContract(payload, {
      fields: PATIENT_BASELINE_FORM_FIELDS,
      parse: buildSubmissionInput,
      schema: patientBaselineCreateRequestSchema,
    })).toMatchObject({ weight: 65 });
  });
});
