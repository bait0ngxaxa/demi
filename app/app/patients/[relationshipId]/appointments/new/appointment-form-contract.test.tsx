// @vitest-environment jsdom
// Form ↔ server contract: the appointment form posts exactly what CREATE_FORM_FIELDS /
// RESCHEDULE_FORM_FIELDS, their parsers and the request schemas accept.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { appointmentCreateRequestSchema, appointmentRescheduleRequestSchema } from "@/modules/appointments/schemas/appointment-schemas";
import {
  buildCreateInput,
  buildRescheduleInput,
  CREATE_FORM_FIELDS,
  RESCHEDULE_FORM_FIELDS,
} from "@/modules/appointments/transport/appointment-form-input";

import {
  captureSubmittedFormData,
  expectFormContract,
  installFormContractEnvironment,
  setFieldValue,
  submitForm,
} from "../../../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  reschedule: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/appointments/transport/server-actions", () => ({
  createAppointmentAction: actions.create,
  rescheduleAppointmentAction: actions.reschedule,
}));
vi.mock("@/modules/appointments/transport/assignee-search-actions", () => ({
  searchAppointmentOsmCandidatesAction: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
  searchAppointmentResponsibleMembersAction: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
}));

import { AppointmentForm } from "./appointment-form";

const ids = {
  relationship: "11111111-1111-4111-8111-111111111111",
  appointment: "22222222-2222-4222-8222-222222222222",
  nonce: "33333333-3333-4333-8333-333333333333",
  rescheduleRequest: "44444444-4444-4444-8444-444444444444",
};
const common = {
  currentOsmAssignee: null,
  patient: {
    patientHospitalRelationshipId: ids.relationship,
    displayName: "สมชาย ผู้ป่วย",
    hospitalNumber: "HN-001",
    hospital: { id: "55555555-5555-4555-8555-555555555555", name: "โรงพยาบาล ก" },
  },
  relationshipId: ids.relationship,
  selectedOsm: null,
  selectedResponsible: null,
};
const existing = {
  appointmentId: ids.appointment,
  type: "FOLLOW_UP" as const,
  scheduledAt: "2026-11-20T02:00:00.000Z",
  durationMinutes: 30,
  locationType: null,
  locationDetail: null,
  note: null,
  responsibleUserId: null,
  assignedOsmUserId: null,
  serviceCode: null,
  updatedAt: "2026-11-10T03:00:00.000Z",
};

beforeAll(() => {
  installFormContractEnvironment();
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.create.mockResolvedValue({ status: "IDLE" });
  actions.reschedule.mockResolvedValue({ status: "IDLE" });
});

function fillDetails(container: HTMLElement): void {
  setFieldValue(container.querySelector("#appointment-scheduled-at"), "2026-11-25T09:30");
  setFieldValue(container.querySelector("#appointment-duration"), "45");
  setFieldValue(container.querySelector("#appointment-location-detail"), "ห้องตรวจ 3");
  setFieldValue(container.querySelector("#appointment-note"), "งดอาหารก่อนเจาะเลือด");
  const form = container.querySelector("form");
  submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
}

describe("Appointment form ↔ appointment server actions", () => {
  it("create posts every create field", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <AppointmentForm {...common} mode="create" submissionNonce={ids.nonce} />,
      action: actions.create,
      interact: fillDetails,
    });

    expect(expectFormContract(payload, { fields: CREATE_FORM_FIELDS, parse: buildCreateInput, schema: appointmentCreateRequestSchema }))
      .toMatchObject({ scheduledAt: "2026-11-25T09:30:00+07:00", durationMinutes: 45, locationDetail: "ห้องตรวจ 3", serviceCode: null });
  });

  it("create with a service posts the service code and its type", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <AppointmentForm {...common} mode="create" submissionNonce={ids.nonce} />,
      action: actions.create,
      interact: (container) => {
        const service = container.querySelector<HTMLSelectElement>("#appointment-service");
        setFieldValue(service, service?.options[1]?.value ?? "");
        fillDetails(container);
      },
    });

    const parsed = expectFormContract(payload, { fields: CREATE_FORM_FIELDS, parse: buildCreateInput, schema: appointmentCreateRequestSchema });
    expect(parsed).toMatchObject({ serviceCode: expect.any(String) });
  });

  it("reschedule posts the appointment version and no service code", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <AppointmentForm {...common} appointment={existing} mode="reschedule" />,
      action: actions.reschedule,
      interact: fillDetails,
    });

    expect(expectFormContract(payload, {
      fields: RESCHEDULE_FORM_FIELDS,
      notPosted: ["rescheduleRequestId"],
      parse: buildRescheduleInput,
      schema: appointmentRescheduleRequestSchema,
    })).toMatchObject({ appointmentId: ids.appointment, expectedUpdatedAt: existing.updatedAt, durationMinutes: 45 });
  });

  it("reschedule from a patient request also posts the request", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <AppointmentForm
          {...common}
          appointment={existing}
          mode="reschedule"
          reschedulePreferredDates={["2026-11-25"]}
          rescheduleReason="ติดธุระ"
          rescheduleRequestId={ids.rescheduleRequest}
        />
      ),
      action: actions.reschedule,
      interact: fillDetails,
    });

    expect(expectFormContract(payload, { fields: RESCHEDULE_FORM_FIELDS, parse: buildRescheduleInput, schema: appointmentRescheduleRequestSchema }))
      .toMatchObject({ rescheduleRequestId: ids.rescheduleRequest });
  });
});
