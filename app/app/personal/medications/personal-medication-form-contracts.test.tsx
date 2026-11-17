// @vitest-environment jsdom
// Form ↔ server contract: the medication controls post exactly what the medication action accepts:
// create and schedule go through parseMedication*Form and their field limits; update and stop go
// through Object.fromEntries and their `.strict()` schemas.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  personalMedicationCreateSchema,
  personalMedicationScheduleSchema,
  personalMedicationStopSchema,
  personalMedicationUpdateSchema,
} from "@/modules/medications/schemas/personal-medication-schemas";
import {
  MEDICATION_CREATE_FORM_FIELD_LIMITS,
  MEDICATION_SCHEDULE_FORM_FIELD_LIMITS,
  parseMedicationCreateForm,
  parseMedicationScheduleForm,
} from "@/modules/medications/transport/schedule-form";

import {
  captureSubmittedFormData,
  clickButton,
  clickElement,
  expectFormContract,
  findButton,
  installFormContractEnvironment,
  setFieldValue,
  settleForm,
  submitForm,
} from "../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  stop: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@/modules/medications/transport/server-actions", () => ({
  createPersonalMedicationAction: actions.create,
  updatePersonalMedicationAction: actions.update,
  stopPersonalMedicationAction: actions.stop,
  replacePersonalMedicationSchedulesAction: actions.schedule,
}));

import { MedicationEditor, MedicationScheduleEditor, MedicationStopForm } from "./personal-medication-controls";

const medicationId = "11111111-1111-4111-8111-111111111111";
const updatedAt = "2026-11-16T03:00:00.000Z";
const item = {
  id: medicationId,
  medicationName: "เมทฟอร์มิน 500 มก.",
  instructionText: "หลังอาหารเช้าและเย็น",
  status: "ACTIVE" as const,
  stoppedAt: null,
  createdAt: updatedAt,
  updatedAt,
};

/** What the medication action does for update and stop: every non-framework entry, as is. */
function fromEntries(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries([...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_")));
}

beforeAll(() => {
  installFormContractEnvironment();
  globalThis.requestAnimationFrame ??= (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0) as unknown as number;
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) action.mockResolvedValue({ status: "IDLE" });
});

function submitWith(container: HTMLElement, label: string): void {
  const button = findButton(container, label);
  submitForm(button.form, button);
}

describe("Medication controls ↔ medication server actions", () => {
  it("create posts the name, instruction and reminder times", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <MedicationEditor />,
      action: actions.create,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="medicationName"]'), "เมทฟอร์มิน 500 มก.");
        setFieldValue(container.querySelector('[name="instructionText"]'), "หลังอาหารเช้า");
        const preset = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => /\d{2}:\d{2}/u.test(button.textContent ?? ""));
        clickElement(preset ?? null);
        submitWith(container, "เพิ่มรายการ");
      },
    });

    const parsed = expectFormContract(payload, {
      fields: Object.keys(MEDICATION_CREATE_FORM_FIELD_LIMITS),
      parse: parseMedicationCreateForm,
      schema: personalMedicationCreateSchema,
    });
    expect(parsed).toMatchObject({ medicationName: "เมทฟอร์มิน 500 มก.", instructionText: "หลังอาหารเช้า" });
    expect((parsed as { times: string[] }).times).toHaveLength(1);
  });

  it("update posts the medication version and text only", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <MedicationEditor item={item} />,
      action: actions.update,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="instructionText"]'), "หลังอาหารเช้า กลางวัน และเย็น");
        submitWith(container, "บันทึกการแก้ไข");
      },
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(personalMedicationUpdateSchema.shape),
      parse: fromEntries,
      schema: personalMedicationUpdateSchema,
    })).toMatchObject({ medicationId, expectedUpdatedAt: updatedAt, instructionText: "หลังอาหารเช้า กลางวัน และเย็น" });
  });

  it("stop posts the medication version after confirmation", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <MedicationStopForm item={item} />,
      action: actions.stop,
      interact: async (container) => {
        submitWith(container, "หยุดติดตามรายการนี้ใน DEMI");
        const confirm = [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find((button) => button.textContent?.trim() === "ยืนยันหยุดติดตาม");
        clickElement(confirm ?? null);
        await settleForm();
      },
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(personalMedicationStopSchema.shape),
      parse: fromEntries,
      schema: personalMedicationStopSchema,
    })).toMatchObject({ medicationId, expectedUpdatedAt: updatedAt });
  });

  it("schedule posts the medication version and the edited times", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <MedicationScheduleEditor item={{ ...item, schedules: [{ localTime: "08:00" }] }} />,
      action: actions.schedule,
      interact: (container) => {
        clickButton(container, /เพิ่มเวลา/u);
        const timeInputs = container.querySelectorAll<HTMLInputElement>('input[type="time"]');
        setFieldValue(timeInputs[timeInputs.length - 1] ?? null, "20:00");
        submitWith(container, "บันทึกเวลา");
      },
    });

    expect(expectFormContract(payload, {
      fields: Object.keys(MEDICATION_SCHEDULE_FORM_FIELD_LIMITS),
      parse: parseMedicationScheduleForm,
      schema: personalMedicationScheduleSchema,
    })).toMatchObject({ medicationId, expectedUpdatedAt: updatedAt, times: ["08:00", "20:00"] });
  });
});
