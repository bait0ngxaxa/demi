// @vitest-environment jsdom
// Form ↔ server contract: the Program open and complete controls post exactly what
// PROGRAM_OPEN_FORM_FIELDS / PROGRAM_COMPLETE_FORM_FIELDS, their parsers and schemas accept.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  patientProgramCompleteRequestSchema,
  patientProgramOpenRequestSchema,
} from "@/modules/patient-program/schemas/patient-program-schemas";
import {
  buildCompleteInput,
  buildOpenInput,
  PROGRAM_COMPLETE_FORM_FIELDS,
  PROGRAM_OPEN_FORM_FIELDS,
} from "@/modules/patient-program/transport/program-form-input";

import {
  captureSubmittedFormData,
  clickElement,
  expectFormContract,
  installFormContractEnvironment,
  settleForm,
  submitForm,
} from "../../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  open: vi.fn(),
  complete: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-program/transport/server-actions", () => ({
  openPatientProgramAction: actions.open,
  completePatientProgramAction: actions.complete,
}));

import { PatientProgramCompleteControl, PatientProgramOpenControl } from "./program-mutation-controls";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";

beforeAll(() => {
  installFormContractEnvironment();
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.open.mockResolvedValue({ status: "IDLE" });
  actions.complete.mockResolvedValue({ status: "IDLE" });
});

function submit(container: HTMLElement): void {
  const form = container.querySelector("form");
  submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
}

describe("Program controls ↔ Program server actions", () => {
  it("open posts the relationship", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <PatientProgramOpenControl relationshipId={relationshipId} />,
      action: actions.open,
      interact: submit,
    });

    expect(expectFormContract(payload, { fields: PROGRAM_OPEN_FORM_FIELDS, parse: buildOpenInput, schema: patientProgramOpenRequestSchema }))
      .toEqual({ patientHospitalRelationshipId: relationshipId });
  });

  it("complete posts the Program after confirmation", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <PatientProgramCompleteControl programId={programId} />,
      action: actions.complete,
      interact: async (container) => {
        submit(container);
        const confirm = [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find((button) => button.textContent?.trim() === "จบโปรแกรม");
        clickElement(confirm ?? null);
        await settleForm();
      },
    });

    expect(expectFormContract(payload, { fields: PROGRAM_COMPLETE_FORM_FIELDS, parse: buildCompleteInput, schema: patientProgramCompleteRequestSchema }))
      .toEqual({ patientProgramId: programId });
  });
});
