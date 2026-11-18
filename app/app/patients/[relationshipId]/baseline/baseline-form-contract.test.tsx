// @vitest-environment jsdom
// Form ↔ server contract: the Baseline form posts exactly what PATIENT_BASELINE_FORM_FIELDS,
// buildSubmissionInput and patientBaselineCreateRequestSchema accept in create mode, and what
// PATIENT_BASELINE_UPDATE_FORM_FIELDS, buildUpdateSubmissionInput and
// patientBaselineUpdateRequestSchema accept in edit mode.
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { PatientBaselineProjection } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import {
  patientBaselineCreateRequestSchema,
  patientBaselineUpdateRequestSchema,
} from "@/modules/patient-baseline/schemas/patient-baseline-schemas";
import {
  buildSubmissionInput,
  buildUpdateSubmissionInput,
  PATIENT_BASELINE_FORM_FIELDS,
  PATIENT_BASELINE_UPDATE_FORM_FIELDS,
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
  update: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-baseline/transport/server-actions", () => ({
  createPatientBaselineAction: actions.create,
  updatePatientBaselineAction: actions.update,
}));

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

function confirmFromReview(container: HTMLElement, confirmLabel = "ยืนยันบันทึกข้อมูลตั้งต้น"): void {
  const form = container.querySelector("form");
  submitForm(form, findButton(container, "ตรวจสอบข้อมูลก่อนบันทึก"));
  submitForm(form, findButton(document.body, confirmLabel));
}

const storedVersion = "2026-11-02T03:04:05.678Z";
const stored: PatientBaselineProjection = {
  id: "33333333-3333-4333-8333-333333333333",
  patientHospitalRelationshipId: relationshipId,
  recordedOn: new Date("2026-11-01T00:00:00.000Z"),
  recorder: { id: "44444444-4444-4444-8444-444444444444", displayName: "ผู้บันทึก" },
  measurements: {
    weight: 72.4,
    heightCm: 168,
    waistCircumference: null,
    bloodPressureSystolic: 132,
    bloodPressureDiastolic: 84,
    bloodSugarDtx: 118,
    hba1c: 6.8,
    cvdRiskScore: 12.5,
  },
  adaptation: { summary: null, obstacles: null, opportunities: null },
  confidence: { score: null, improvementPlan: null },
  summary: "นำเข้าจาก Excel",
  recommendations: null,
  createdAt: new Date("2026-11-01T05:00:00.000Z"),
  updatedAt: new Date(storedVersion),
};

function editForm() {
  return (
    <PatientBaselineForm
      edit={{ baseline: stored, onCancel: vi.fn(), onSaved: vi.fn() }}
      patient={patient}
      relationshipId={relationshipId}
    />
  );
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

describe("Baseline form (edit mode) ↔ updatePatientBaselineAction", () => {
  it("prefills the stored values and posts every field with the loaded version", async () => {
    actions.create.mockClear();
    actions.update.mockResolvedValue({ status: "IDLE" });
    const payload = await captureSubmittedFormData({
      render: editForm,
      action: actions.update,
      interact: (container) => {
        const value = (name: string): string | null =>
          container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value ?? null;
        expect([value("recordedOn"), value("weight"), value("waistCircumference"), value("cvdRiskScore"), value("summary")])
          .toEqual(["2026-11-01", "72.4", "", "12.5", "นำเข้าจาก Excel"]);
        setFieldValue(container.querySelector('[name="weight"]'), "71");
        setFieldValue(container.querySelector('[name="hba1c"]'), "");
        setFieldValue(container.querySelector('[name="confidenceScore"]'), "7");
        setFieldValue(container.querySelector('[name="adaptationSummary"]'), "เริ่มเดินหลังอาหาร");
        confirmFromReview(container, "ยืนยันบันทึกการแก้ไข");
      },
    });

    expect(actions.update).toHaveBeenCalledTimes(1);
    expect(actions.create).not.toHaveBeenCalled();
    expect(expectFormContract(payload, {
      fields: PATIENT_BASELINE_UPDATE_FORM_FIELDS,
      parse: buildUpdateSubmissionInput,
      schema: patientBaselineUpdateRequestSchema,
    })).toMatchObject({
      patientHospitalRelationshipId: relationshipId,
      expectedUpdatedAt: storedVersion,
      recordedOn: "2026-11-01",
      weight: 71,
      hba1c: null,
      bloodPressureSystolic: 132,
      cvdRiskScore: 12.5,
      confidenceScore: 7,
      adaptationSummary: "เริ่มเดินหลังอาหาร",
      summary: "นำเข้าจาก Excel",
    });
  });

  it("rejects the edit payload on the create allow-list, so each mode keeps its own contract", async () => {
    actions.update.mockResolvedValue({ status: "IDLE" });
    const payload = await captureSubmittedFormData({
      render: editForm,
      action: actions.update,
      interact: (container) => confirmFromReview(container, "ยืนยันบันทึกการแก้ไข"),
    });

    expect(buildSubmissionInput(payload)).toBeNull();
    expect(PATIENT_BASELINE_FORM_FIELDS.has("expectedUpdatedAt")).toBe(false);
  });
});
