// @vitest-environment jsdom
// Form ↔ server contract: the staff appointment detail controls post exactly what the transition,
// acknowledgement, cancellation request, coordination, cancellation review and assignment acceptance
// allow-lists, their parsers and request schemas accept.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appointmentAcknowledgementRequestSchema,
  appointmentAssignmentAcceptanceRequestSchema,
  appointmentCancellationRequestSchema,
  appointmentCancellationReviewRequestSchema,
  appointmentCoordinationRequestSchema,
  appointmentTransitionRequestSchema,
} from "@/modules/appointments/schemas/appointment-schemas";
import {
  ACKNOWLEDGEMENT_FORM_FIELDS,
  ASSIGNMENT_ACCEPTANCE_FORM_FIELDS,
  buildAcknowledgementInput,
  buildAssignmentAcceptanceInput,
  buildCancellationRequestInput,
  buildCancellationReviewInput,
  buildCoordinationInput,
  buildTransitionInput,
  CANCELLATION_REQUEST_FORM_FIELDS,
  CANCELLATION_REVIEW_FORM_FIELDS,
  COORDINATION_FORM_FIELDS,
  TRANSITION_FORM_FIELDS,
} from "@/modules/appointments/transport/appointment-form-input";

import {
  captureSubmittedFormData,
  clickElement,
  expectFormContract,
  findButton,
  installFormContractEnvironment,
  settleForm,
  submitForm,
} from "../../../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  acceptAssignment: vi.fn(),
  acknowledgeOnBehalf: vi.fn(),
  approve: vi.fn(),
  cancel: vi.fn(),
  complete: vi.fn(),
  coordination: vi.fn(),
  noShow: vi.fn(),
  reject: vi.fn(),
  requestOnBehalf: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/appointments/transport/server-actions", () => ({
  acceptAppointmentAssignmentAction: actions.acceptAssignment,
  acknowledgeAppointmentOnBehalfOfPatientAction: actions.acknowledgeOnBehalf,
  approveAppointmentCancellationRequestAction: actions.approve,
  cancelAppointmentAction: actions.cancel,
  completeAppointmentAction: actions.complete,
  markAppointmentNoShowAction: actions.noShow,
  recordAppointmentCoordinationAction: actions.coordination,
  rejectAppointmentCancellationRequestAction: actions.reject,
  requestAppointmentCancellationOnBehalfOfPatientAction: actions.requestOnBehalf,
}));

import { AppointmentAssignmentControls } from "./appointment-assignment-controls";
import { AppointmentInteractionControls } from "./appointment-interaction-controls";
import { AppointmentMutationControls } from "./appointment-mutation-controls";

const ids = {
  relationship: "11111111-1111-4111-8111-111111111111",
  appointment: "22222222-2222-4222-8222-222222222222",
  cancellationNonce: "33333333-3333-4333-8333-333333333333",
  coordinationNonce: "44444444-4444-4444-8444-444444444444",
  request: "55555555-5555-4555-8555-555555555555",
  assignmentNonce: "66666666-6666-4666-8666-666666666666",
};
const expectedUpdatedAt = "2026-11-10T03:00:00.000Z";
const target = { patientHospitalRelationshipId: ids.relationship, appointmentId: ids.appointment };

beforeAll(() => {
  installFormContractEnvironment();
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) {
    if (typeof action === "function") action.mockResolvedValue({ status: "IDLE" });
  }
});

function submitByLabel(scope: ParentNode, label: string): void {
  const button = findButton(scope, label);
  submitForm(button.form, button);
}

async function confirmInDialog(label: string): Promise<void> {
  const confirm = [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find((button) => button.textContent?.trim() === label);
  clickElement(confirm ?? null);
  await settleForm();
}

const transition = { fields: TRANSITION_FORM_FIELDS, parse: buildTransitionInput, schema: appointmentTransitionRequestSchema };

describe("Appointment mutation controls ↔ transition actions", () => {
  const render = () => (
    <AppointmentMutationControls appointmentId={ids.appointment} canManage expectedUpdatedAt={expectedUpdatedAt} relationshipId={ids.relationship} status="SCHEDULED" />
  );

  it("complete posts the transition fields after confirmation", async () => {
    const payload = await captureSubmittedFormData({
      render,
      action: actions.complete,
      interact: async (container) => {
        submitByLabel(container, "ทำเครื่องหมายว่าเสร็จสิ้น");
        await confirmInDialog("ยืนยันผลนัดหมาย");
      },
    });

    expect(expectFormContract(payload, transition)).toEqual({ ...target, expectedUpdatedAt });
  });

  it("no-show posts the transition fields", async () => {
    const payload = await captureSubmittedFormData({
      render,
      action: actions.noShow,
      interact: (container) => submitByLabel(container, "ทำเครื่องหมายว่าไม่มาตามนัด"),
    });

    expect(expectFormContract(payload, transition)).toEqual({ ...target, expectedUpdatedAt });
  });

  it("cancel posts the transition fields after confirmation", async () => {
    const payload = await captureSubmittedFormData({
      render,
      action: actions.cancel,
      interact: async (container) => {
        submitByLabel(container, "ยกเลิกนัดหมาย");
        await confirmInDialog("ยกเลิกนัดหมาย");
      },
    });

    expect(expectFormContract(payload, transition)).toEqual({ ...target, expectedUpdatedAt });
  });
});

describe("Appointment interaction controls ↔ interaction actions", () => {
  const pendingRequest = {
    requestId: ids.request,
    source: "PATIENT_SELF" as const,
    status: "PENDING" as const,
    submittedAt: new Date("2026-11-11T03:00:00.000Z"),
    resolvedAt: null,
    submittedByDisplayName: "สมชาย ผู้ป่วย",
    resolvedByDisplayName: null,
  };
  const render = (cancellationRequests: (typeof pendingRequest)[] = []) => (
    <AppointmentInteractionControls
      acknowledgement={null}
      appointmentId={ids.appointment}
      canManage
      canProxyPatientActions
      canRecordCoordination
      cancellationRequestNonce={ids.cancellationNonce}
      cancellationRequests={cancellationRequests}
      coordinationEvents={[]}
      coordinationSubmissionNonce={ids.coordinationNonce}
      expectedUpdatedAt={expectedUpdatedAt}
      relationshipId={ids.relationship}
      status="SCHEDULED"
    />
  );

  it("acknowledgement on behalf of the patient posts the acknowledgement fields", async () => {
    const payload = await captureSubmittedFormData({
      render: () => render(),
      action: actions.acknowledgeOnBehalf,
      interact: (container) => {
        const form = container.querySelector<HTMLInputElement>('input[name="expectedUpdatedAt"]')?.form ?? null;
        submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
      },
    });

    expect(expectFormContract(payload, { fields: ACKNOWLEDGEMENT_FORM_FIELDS, parse: buildAcknowledgementInput, schema: appointmentAcknowledgementRequestSchema }))
      .toEqual({ ...target, expectedUpdatedAt });
  });

  it("cancellation request on behalf of the patient posts its nonce", async () => {
    const payload = await captureSubmittedFormData({
      render: () => render(),
      action: actions.requestOnBehalf,
      interact: (container) => submitByLabel(container, "ส่งคำขอยกเลิกแทนผู้ป่วย"),
    });

    expect(expectFormContract(payload, {
      fields: CANCELLATION_REQUEST_FORM_FIELDS,
      parse: buildCancellationRequestInput,
      schema: appointmentCancellationRequestSchema,
    })).toEqual({ ...target, expectedUpdatedAt, submissionNonce: ids.cancellationNonce });
  });

  it("coordination posts its nonce", async () => {
    const payload = await captureSubmittedFormData({
      render: () => render(),
      action: actions.coordination,
      interact: (container) => {
        const form = container.querySelector<HTMLInputElement>(`input[name="submissionNonce"][value="${ids.coordinationNonce}"]`)?.form ?? null;
        submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
      },
    });

    expect(expectFormContract(payload, { fields: COORDINATION_FORM_FIELDS, parse: buildCoordinationInput, schema: appointmentCoordinationRequestSchema }))
      .toEqual({ ...target, submissionNonce: ids.coordinationNonce });
  });

  it("approving a pending cancellation request posts the request after confirmation", async () => {
    const payload = await captureSubmittedFormData({
      render: () => render([pendingRequest]),
      action: actions.approve,
      interact: async (container) => {
        const form = container.querySelector<HTMLInputElement>('input[name="requestId"]')?.form ?? null;
        submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
        await confirmInDialog("อนุมัติและยกเลิกนัด");
      },
    });

    expect(expectFormContract(payload, {
      fields: CANCELLATION_REVIEW_FORM_FIELDS,
      parse: (formData) => buildCancellationReviewInput(formData, "APPROVE"),
      schema: appointmentCancellationReviewRequestSchema,
    })).toEqual({ ...target, requestId: ids.request, decision: "APPROVE" });
  });

  it("rejecting a pending cancellation request posts the request", async () => {
    const payload = await captureSubmittedFormData({
      render: () => render([pendingRequest]),
      action: actions.reject,
      interact: (container) => {
        const forms = [...container.querySelectorAll<HTMLInputElement>('input[name="requestId"]')].map((input) => input.form);
        const form = forms[forms.length - 1] ?? null;
        submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
      },
    });

    expect(expectFormContract(payload, {
      fields: CANCELLATION_REVIEW_FORM_FIELDS,
      parse: (formData) => buildCancellationReviewInput(formData, "REJECT"),
      schema: appointmentCancellationReviewRequestSchema,
    })).toEqual({ ...target, requestId: ids.request, decision: "REJECT" });
  });
});

describe("Appointment assignment controls ↔ acceptAppointmentAssignmentAction", () => {
  it("accepting the assignment posts the appointment version and nonce after confirmation", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <AppointmentAssignmentControls
          acceptedAt={null}
          appointmentId={ids.appointment}
          assignedOsmDisplayName="อสม. สมศรี"
          canAcceptAssignment
          expectedUpdatedAt={expectedUpdatedAt}
          relationshipId={ids.relationship}
          submissionNonce={ids.assignmentNonce}
        />
      ),
      action: actions.acceptAssignment,
      interact: async (container) => {
        const form = container.querySelector("form");
        submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
        await confirmInDialog("ยืนยันตอบรับ");
      },
    });

    expect(expectFormContract(payload, {
      fields: ASSIGNMENT_ACCEPTANCE_FORM_FIELDS,
      parse: buildAssignmentAcceptanceInput,
      schema: appointmentAssignmentAcceptanceRequestSchema,
    })).toEqual({ ...target, sourceAppointmentUpdatedAt: expectedUpdatedAt, submissionNonce: ids.assignmentNonce });
  });
});
