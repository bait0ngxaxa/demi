// @vitest-environment jsdom
// Form ↔ server contract: the self-measurement form posts exactly the fields the create action reads
// (the keys of patientSelfMeasurementCreateSchema), and the action's field reads produce input the
// service schema accepts. The action ignores unknown keys, so an extra key here is dead weight, not a
// rejection; the exact comparison still catches a renamed or missing field.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  patientSelfMeasurementCreateSchema,
  patientSelfMeasurementIdSchema,
} from "@/modules/patient-self-measurements/schemas/patient-self-measurement-schemas";
import {
  buildSelfMeasurementCreateInput,
  readSelfMeasurementId,
} from "@/modules/patient-self-measurements/transport/self-measurement-form-input";

import {
  captureSubmittedFormData,
  clickElement,
  expectFormContract,
  findButton,
  installFormContractEnvironment,
  setFieldValue,
  settleForm,
  submitForm,
} from "../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({ create: vi.fn(), delete: vi.fn() }));

vi.mock("@/modules/patient-self-measurements/transport/server-actions", () => ({
  createOwnPatientSelfMeasurementAction: actions.create,
  deleteOwnPatientSelfMeasurementAction: actions.delete,
}));

import { PatientSelfMeasurementWorkspace } from "./patient-self-measurement-workspace";

const nonce = "11111111-1111-4111-8111-111111111111";
const measurementId = "22222222-2222-4222-8222-222222222222";
const measuredAt = new Date("2026-11-16T12:30:00.000Z");

beforeAll(() => {
  installFormContractEnvironment();
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.create.mockResolvedValue({ status: "IDLE" });
  actions.delete.mockResolvedValue({ status: "IDLE" });
});

function render(items: Parameters<typeof PatientSelfMeasurementWorkspace>[0]["items"] = []) {
  return <PatientSelfMeasurementWorkspace defaultMeasuredAt="2026-11-16T19:00" hasCursor={false} items={items} nextCursor={null} nonce={nonce} />;
}

describe("Self-measurement workspace ↔ self-measurement actions", () => {
  it("create posts every field the action reads", async () => {
    const payload = await captureSubmittedFormData({
      render: () => render(),
      action: actions.create,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="weight"]'), "66.8");
        setFieldValue(container.querySelector('[name="systolicBloodPressure"]'), "124");
        setFieldValue(container.querySelector('[name="diastolicBloodPressure"]'), "78");
        setFieldValue(container.querySelector('[name="bloodSugar"]'), "112");
        setFieldValue(container.querySelector('[name="note"]'), "วัดหลังอาหาร 2 ชั่วโมง");
        const form = container.querySelector<HTMLInputElement>('input[name="submissionNonce"]')?.form ?? null;
        submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
      },
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(patientSelfMeasurementCreateSchema.shape),
      parse: buildSelfMeasurementCreateInput,
      schema: patientSelfMeasurementCreateSchema,
    })).toMatchObject({ submissionNonce: nonce, weight: 66.8, bloodSugar: 112, note: "วัดหลังอาหาร 2 ชั่วโมง" });
  });

  it("delete posts the measurement after confirmation", async () => {
    const payload = await captureSubmittedFormData({
      render: () => render([{
        measurementId,
        measuredAt,
        createdAt: measuredAt,
        weight: 66.8,
        bloodSugar: null,
        systolicBloodPressure: null,
        diastolicBloodPressure: null,
        note: null,
        canDelete: true,
      }]),
      action: actions.delete,
      interact: async (container) => {
        const button = findButton(container, "ลบ");
        submitForm(button.form, button);
        const confirm = [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find((node) => node.textContent?.trim() === "ลบรายการ");
        clickElement(confirm ?? null);
        await settleForm();
      },
    });

    expect(expectFormContract(payload, {
      fields: ["measurementId"],
      parse: readSelfMeasurementId,
      schema: patientSelfMeasurementIdSchema,
    })).toBe(measurementId);
  });
});
