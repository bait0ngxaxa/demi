// @vitest-environment jsdom
// Form ↔ server contract: the staff patient edit form posts exactly the keys of the `.strict()` schema the
// service validates the action's input with (staff profile, and health history).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { patientHealthHistorySchema } from "@/modules/patient-hospital-profile/schemas/patient-health-history-schemas";
import { staffPatientHospitalProfileUpdateSchema } from "@/modules/patient-hospital-profile/schemas/patient-hospital-profile-schemas";
import {
  buildPatientHealthHistoryInput,
  buildStaffPatientProfileInput,
} from "@/modules/patient-hospital-profile/transport/hospital-patient-edit-input";

import {
  captureSubmittedFormData,
  expectFormContract,
  installFormContractEnvironment,
  setFieldValue,
  submitForm,
} from "../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  health: vi.fn(),
  profile: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-hospital-profile/transport/hospital-patient-edit-actions", () => ({
  savePatientHealthHistoryAction: actions.health,
  saveStaffPatientHospitalProfileAction: actions.profile,
}));

import { HospitalPatientEditForm } from "./hospital-patient-edit-form";

const relationshipId = "11111111-1111-4111-8111-111111111111";

beforeAll(() => {
  installFormContractEnvironment();
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.health.mockResolvedValue({ status: "IDLE", message: "" });
  actions.profile.mockResolvedValue({ status: "IDLE", message: "" });
});

function submit(container: HTMLElement): void {
  const form = container.querySelector("form");
  submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
}

describe("Staff patient edit form ↔ hospital patient edit actions", () => {
  it("profile posts every staff profile field", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <HospitalPatientEditForm health={false} relationshipId={relationshipId} values={{ phoneNumber: "0812345678", province: "เชียงใหม่" }} version={3} />,
      action: actions.profile,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="houseNumber"]'), "99/1");
        setFieldValue(container.querySelector('[name="postalCode"]'), "50200");
        setFieldValue(container.querySelector('[name="emergencyContactName"]'), "สมหญิง ใจดี");
        submit(container);
      },
    });

    expect(actions.profile.mock.calls[0]?.[0]).toBe(relationshipId);
    expect(expectFormContract(payload, {
      fields: Object.keys(staffPatientHospitalProfileUpdateSchema.shape),
      parse: buildStaffPatientProfileInput,
      schema: staffPatientHospitalProfileUpdateSchema,
    })).toMatchObject({ expectedVersion: 3, houseNumber: "99/1", postalCode: "50200", province: "เชียงใหม่" });
  });

  it("health history posts every answer, other conditions and the diagnosis year", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <HospitalPatientEditForm health relationshipId={relationshipId} values={{ diabetes: "YES" }} version={2} />,
      action: actions.health,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="hypertension"]'), "NO");
        setFieldValue(container.querySelector('[name="otherConditions"]'), "ไขมันในเลือดสูง");
        setFieldValue(container.querySelector('[name="diagnosisYear"]'), "2560");
        submit(container);
      },
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(patientHealthHistorySchema.shape),
      parse: buildPatientHealthHistoryInput,
      schema: patientHealthHistorySchema,
    })).toMatchObject({ expectedVersion: 2, diabetes: "YES", hypertension: "NO", diagnosisYear: 2560, otherConditions: "ไขมันในเลือดสูง" });
  });
});
