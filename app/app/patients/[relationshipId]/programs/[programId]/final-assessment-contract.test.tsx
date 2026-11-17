// @vitest-environment jsdom
// Form ↔ server contract: the Final Assessment form posts exactly what FINAL_ASSESSMENT_FORM_FIELDS,
// buildCreateInput and patientFinalAssessmentCreateRequestSchema accept.
import { PatientProgramStatus } from "@prisma/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { patientFinalAssessmentCreateRequestSchema } from "@/modules/patient-final-assessment/schemas/patient-final-assessment-schemas";
import type { PatientFinalAssessmentProjection } from "@/modules/patient-final-assessment/services/patient-final-assessment-query-service";
import {
  buildCreateInput,
  FINAL_ASSESSMENT_FORM_FIELDS,
} from "@/modules/patient-final-assessment/transport/server-action-helpers";
import type { PatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";

import {
  captureSubmittedFormData,
  expectFormContract,
  installFormContractEnvironment,
  setFieldValue,
  submitForm,
} from "../../../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-final-assessment/transport/server-actions", () => ({
  createPatientFinalAssessmentAction: actions.create,
}));

import { PatientProgramFinalAssessmentWorkspace } from "./final-assessment-workspace";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const recordedAt = new Date("2026-08-22T05:00:00.000Z");

const detail = {
  programId,
  patientHospitalRelationshipId: relationshipId,
  status: PatientProgramStatus.ACTIVE,
  startedAt: recordedAt,
  completedAt: null,
  createdAt: recordedAt,
  createdBy: { id: "44444444-4444-4444-8444-444444444444", displayName: "ผู้เปิดโปรแกรม" },
  initialBaseline: null,
  patient: {
    patientHospitalRelationshipId: relationshipId,
    displayName: "สมชาย ผู้ป่วย",
    hospitalNumber: "HN-001",
    hospital: { id: "33333333-3333-4333-8333-333333333333", name: "โรงพยาบาล ก" },
  },
  canManage: true,
  serviceOne: [],
} satisfies PatientProgramDetail;

const projection = {
  patientProgramId: programId,
  patientHospitalRelationshipId: relationshipId,
  programStatus: PatientProgramStatus.ACTIVE,
  finalAssessment: null,
} satisfies PatientFinalAssessmentProjection;

beforeAll(() => {
  installFormContractEnvironment();
});

describe("Final Assessment form ↔ createPatientFinalAssessmentAction", () => {
  it("posts the service date and every measurement", async () => {
    actions.create.mockResolvedValue({ status: "IDLE" });
    const payload = await captureSubmittedFormData({
      render: () => <PatientProgramFinalAssessmentWorkspace detail={detail} finalAssessment={projection} todayServiceDate="2026-08-21" />,
      action: actions.create,
      interact: (container) => {
        const values = { weight: "70.2", waistCircumference: "86", systolicBloodPressure: "126", diastolicBloodPressure: "80", bloodSugar: "102", hba1c: "6.2", cvdRiskScore: "9.5" };
        for (const [name, value] of Object.entries(values)) {
          setFieldValue(container.querySelector(`[name="${name}"]`), value);
        }
        const form = container.querySelector("form");
        submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
      },
    });

    expect(expectFormContract(payload, {
      fields: FINAL_ASSESSMENT_FORM_FIELDS,
      parse: buildCreateInput,
      schema: patientFinalAssessmentCreateRequestSchema,
    })).toMatchObject({ patientProgramId: programId, serviceDate: "2026-08-21", weight: 70.2, cvdRiskScore: 9.5 });
  });
});
