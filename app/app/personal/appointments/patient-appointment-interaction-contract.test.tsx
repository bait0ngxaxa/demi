// @vitest-environment jsdom
// Form ↔ server contract: the patient's own appointment controls post exactly what
// ACKNOWLEDGEMENT_FORM_FIELDS / CANCELLATION_REQUEST_FORM_FIELDS, their parsers and schemas accept.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appointmentAcknowledgementRequestSchema,
  appointmentCancellationRequestSchema,
} from "@/modules/appointments/schemas/appointment-schemas";
import {
  ACKNOWLEDGEMENT_FORM_FIELDS,
  buildAcknowledgementInput,
  buildCancellationRequestInput,
  CANCELLATION_REQUEST_FORM_FIELDS,
} from "@/modules/appointments/transport/appointment-form-input";
import type { PatientSelfAppointmentItem } from "@/modules/patient-self/services/patient-self-care-query-service";

import {
  captureSubmittedFormData,
  expectFormContract,
  findButton,
  installFormContractEnvironment,
  submitForm,
} from "../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  requestCancellation: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/appointments/transport/server-actions", () => ({
  acknowledgeOwnPatientAppointmentAction: actions.acknowledge,
  requestOwnPatientAppointmentCancellationAction: actions.requestCancellation,
}));

import { PatientAppointmentInteractionControls } from "./patient-appointment-interaction-controls";

const ids = {
  relationship: "11111111-1111-4111-8111-111111111111",
  appointment: "22222222-2222-4222-8222-222222222222",
  nonce: "33333333-3333-4333-8333-333333333333",
};
const updatedAt = new Date("2026-11-10T03:00:00.000Z");
// Only the fields the controls read; the rest of the projection does not reach the form.
const appointment = {
  appointmentId: ids.appointment,
  status: "SCHEDULED",
  updatedAt,
  acknowledgement: null,
  cancellationRequests: [],
} as unknown as PatientSelfAppointmentItem;

beforeAll(() => {
  installFormContractEnvironment();
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.acknowledge.mockResolvedValue({ status: "IDLE" });
  actions.requestCancellation.mockResolvedValue({ status: "IDLE" });
});

function render() {
  return (
    <PatientAppointmentInteractionControls
      appointment={appointment}
      cancellationRequestNonce={ids.nonce}
      careEnded={false}
      hospitalStatus="ACTIVE"
      relationshipId={ids.relationship}
    />
  );
}

describe("Patient appointment controls ↔ own appointment actions", () => {
  it("acknowledgement posts the acknowledgement fields", async () => {
    const payload = await captureSubmittedFormData({
      render,
      action: actions.acknowledge,
      interact: (container) => {
        const button = findButton(container, "รับทราบนัดหมาย");
        submitForm(button.form, button);
      },
    });

    expect(expectFormContract(payload, { fields: ACKNOWLEDGEMENT_FORM_FIELDS, parse: buildAcknowledgementInput, schema: appointmentAcknowledgementRequestSchema }))
      .toEqual({ patientHospitalRelationshipId: ids.relationship, appointmentId: ids.appointment, expectedUpdatedAt: updatedAt.toISOString() });
  });

  it("cancellation request posts its nonce", async () => {
    const payload = await captureSubmittedFormData({
      render,
      action: actions.requestCancellation,
      interact: (container) => {
        const form = container.querySelector<HTMLInputElement>('input[name="submissionNonce"]')?.form ?? null;
        submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
      },
    });

    expect(expectFormContract(payload, {
      fields: CANCELLATION_REQUEST_FORM_FIELDS,
      parse: buildCancellationRequestInput,
      schema: appointmentCancellationRequestSchema,
    })).toEqual({
      patientHospitalRelationshipId: ids.relationship,
      appointmentId: ids.appointment,
      expectedUpdatedAt: updatedAt.toISOString(),
      submissionNonce: ids.nonce,
    });
  });
});
