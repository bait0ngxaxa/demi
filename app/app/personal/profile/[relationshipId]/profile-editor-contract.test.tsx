// @vitest-environment jsdom
// Form ↔ server contract: the patient's own hospital profile editor posts only keys of
// patientHospitalProfileUpdateSchema (strict), which the action passes `Object.fromEntries(formData)` to.
import { beforeAll, describe, expect, it, vi } from "vitest";

import { patientHospitalProfileUpdateSchema } from "@/modules/patient-hospital-profile/schemas/patient-hospital-profile-schemas";
import type { PatientHospitalProfileDetail } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";

import {
  captureSubmittedFormData,
  expectFormContract,
  installFormContractEnvironment,
  setFieldValue,
  submitForm,
} from "../../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-hospital-profile/transport/server-actions", () => ({
  updateOwnPatientHospitalProfileAction: actions.update,
}));

import { PatientHospitalProfileEditor } from "./profile-editor";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const profile = {
  relationshipId,
  hospitalName: "โรงพยาบาล ก",
  person: { givenName: "สมชาย", familyName: "ใจดี" },
  profile: {
    gender: null,
    phoneNumber: "0812345678",
    addressText: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    occupation: null,
    educationLevel: null,
  },
  emergencyContactRelationship: null,
  source: "HOSPITAL_LOCAL",
  version: 5,
} as unknown as PatientHospitalProfileDetail;

/** The fields the editor renders; the schema's other optional keys are edited elsewhere. */
const editedFields = ["expectedVersion", "gender", "phoneNumber", "addressText", "emergencyContactName", "emergencyContactPhone", "occupation", "educationLevel"];

beforeAll(() => {
  installFormContractEnvironment();
});

describe("Own hospital profile editor ↔ updateOwnPatientHospitalProfileAction", () => {
  it("posts the editable profile fields", async () => {
    actions.update.mockResolvedValue({ status: "IDLE" });
    const payload = await captureSubmittedFormData({
      render: () => <PatientHospitalProfileEditor profile={profile} />,
      action: actions.update,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="addressText"]'), "99/1 ต.สุเทพ อ.เมือง จ.เชียงใหม่");
        setFieldValue(container.querySelector('[name="occupation"]'), "ค้าขาย");
        const form = container.querySelector<HTMLInputElement>('input[name="expectedVersion"]')?.form ?? null;
        submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
      },
    });

    const schemaFields = Object.keys(patientHospitalProfileUpdateSchema.shape);
    expect(expectFormContract(payload, {
      fields: schemaFields,
      notPosted: schemaFields.filter((field) => !editedFields.includes(field)),
      parse: (formData) => Object.fromEntries(formData.entries()),
      schema: patientHospitalProfileUpdateSchema,
    })).toMatchObject({ expectedVersion: 5, phoneNumber: "0812345678", occupation: "ค้าขาย" });
  });
});
