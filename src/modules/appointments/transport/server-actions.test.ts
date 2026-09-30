import { AppointmentStatus, HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedCreate = vi.hoisted(() => vi.fn());
const mockedReschedule = vi.hoisted(() => vi.fn());
const mockedCancel = vi.hoisted(() => vi.fn());
const mockedComplete = vi.hoisted(() => vi.fn());
const mockedNoShow = vi.hoisted(() => vi.fn());
const mockedAcknowledgeSelf = vi.hoisted(() => vi.fn());
const mockedAcknowledgeProxy = vi.hoisted(() => vi.fn());
const mockedRequestSelf = vi.hoisted(() => vi.fn());
const mockedRequestProxy = vi.hoisted(() => vi.fn());
const mockedCoordination = vi.hoisted(() => vi.fn());
const mockedReviewCancellation = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("../services/appointment-service", () => ({
  cancelAppointment: mockedCancel,
  completeAppointment: mockedComplete,
  createAppointment: mockedCreate,
  markAppointmentNoShow: mockedNoShow,
  rescheduleAppointment: mockedReschedule,
  acknowledgeOwnPatientAppointment: mockedAcknowledgeSelf,
  acknowledgeAppointmentOnBehalfOfPatient: mockedAcknowledgeProxy,
  requestOwnPatientAppointmentCancellation: mockedRequestSelf,
  requestAppointmentCancellationOnBehalfOfPatient: mockedRequestProxy,
  recordAppointmentCoordination: mockedCoordination,
  reviewAppointmentCancellationRequest: mockedReviewCancellation,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));

import {
  initialAppointmentActionState,
  initialAppointmentInteractionActionState,
} from "./action-state";
import * as serverActions from "./server-actions";
import {
  cancelAppointmentAction,
  completeAppointmentAction,
  createAppointmentAction,
  markAppointmentNoShowAction,
  rescheduleAppointmentAction,
  acknowledgeOwnPatientAppointmentAction,
  acknowledgeAppointmentOnBehalfOfPatientAction,
  requestOwnPatientAppointmentCancellationAction,
  requestAppointmentCancellationOnBehalfOfPatientAction,
  recordAppointmentCoordinationAction,
  approveAppointmentCancellationRequestAction,
} from "./server-actions";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const appointmentId = "22222222-2222-4222-8222-222222222222";
const nonce = "33333333-3333-4333-8333-333333333333";
const expectedUpdatedAt = "2026-08-17T05:00:00.000Z";
const updatedAt = new Date("2026-08-17T05:00:01.000Z");

const actor = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId: "66666666-6666-4666-8666-666666666666",
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
} satisfies ActorContext;

const mutationResult = {
  appointmentId,
  patientHospitalRelationshipId: relationshipId,
  hospitalId: "66666666-6666-4666-8666-666666666666",
  status: AppointmentStatus.SCHEDULED,
  createdAt: new Date("2026-08-17T04:00:00.000Z"),
  updatedAt,
};

function createFormData(): FormData {
  const data = new FormData();
  data.set("patientHospitalRelationshipId", relationshipId);
  data.set("submissionNonce", nonce);
  data.set("scheduledAt", "2026-08-20T10:30:00+07:00");
  data.set("type", "FOLLOW_UP");
  data.set("responsibleUserId", "77777777-7777-4777-8777-777777777777");
  data.set("durationMinutes", "30");
  data.set("locationType", "CLINIC");
  data.set("locationDetail", "ห้องตรวจ 1");
  data.set("note", "หมายเหตุสำหรับต้นแบบ");
  return data;
}

function rescheduleFormData(): FormData {
  const data = createFormData();
  data.delete("submissionNonce");
  data.set("appointmentId", appointmentId);
  data.set("expectedUpdatedAt", expectedUpdatedAt);
  return data;
}

function transitionFormData(): FormData {
  const data = new FormData();
  data.set("patientHospitalRelationshipId", relationshipId);
  data.set("appointmentId", appointmentId);
  data.set("expectedUpdatedAt", expectedUpdatedAt);
  return data;
}

function acknowledgementFormData(): FormData {
  const data = transitionFormData();
  return data;
}

function cancellationRequestFormData(): FormData {
  const data = acknowledgementFormData();
  data.set("submissionNonce", nonce);
  return data;
}

function cancellationReviewFormData(): FormData {
  const data = new FormData();
  data.set("patientHospitalRelationshipId", relationshipId);
  data.set("appointmentId", appointmentId);
  data.set("requestId", "77777777-7777-4777-8777-777777777777");
  return data;
}

describe("Appointment Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedCreate.mockResolvedValue(mutationResult);
    mockedReschedule.mockResolvedValue(mutationResult);
    mockedCancel.mockResolvedValue({ ...mutationResult, status: AppointmentStatus.CANCELLED });
    mockedComplete.mockResolvedValue({ ...mutationResult, status: AppointmentStatus.COMPLETED });
    mockedNoShow.mockResolvedValue({ ...mutationResult, status: AppointmentStatus.NO_SHOW });
    mockedAcknowledgeSelf.mockResolvedValue({
      appointmentId,
      patientHospitalRelationshipId: relationshipId,
    });
    mockedAcknowledgeProxy.mockResolvedValue({
      appointmentId,
      patientHospitalRelationshipId: relationshipId,
    });
    mockedRequestSelf.mockResolvedValue({ appointmentId, patientHospitalRelationshipId: relationshipId });
    mockedRequestProxy.mockResolvedValue({ appointmentId, patientHospitalRelationshipId: relationshipId });
    mockedCoordination.mockResolvedValue({ appointmentId, patientHospitalRelationshipId: relationshipId });
    mockedReviewCancellation.mockResolvedValue({
      requestId: "77777777-7777-4777-8777-777777777777",
      appointmentId,
      patientHospitalRelationshipId: relationshipId,
      requestStatus: "APPROVED",
      appointmentStatus: AppointmentStatus.CANCELLED,
      updatedAt,
      wasSuperseded: false,
    });
  });

  it("exports the approved Appointment Server Actions", () => {
    expect(Object.keys(serverActions)).toEqual([
      "createAppointmentAction",
      "rescheduleAppointmentAction",
      "cancelAppointmentAction",
      "completeAppointmentAction",
      "markAppointmentNoShowAction",
      "acknowledgeOwnPatientAppointmentAction",
      "acknowledgeAppointmentOnBehalfOfPatientAction",
      "requestOwnPatientAppointmentCancellationAction",
      "requestAppointmentCancellationOnBehalfOfPatientAction",
      "recordAppointmentCoordinationAction",
      "approveAppointmentCancellationRequestAction",
      "rejectAppointmentCancellationRequestAction",
    ]);
    expect(serverActions.createAppointmentAction.constructor.name).toBe("AsyncFunction");
  });

  it("passes only validated form data to create and revalidates relationship-scoped paths", async () => {
    const result = await createAppointmentAction(initialAppointmentActionState, createFormData());

    expect(result).toMatchObject({
      status: "SUCCESS",
      result: { appointmentId, patientHospitalRelationshipId: relationshipId, status: AppointmentStatus.SCHEDULED },
    });
    expect(mockedCreate).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      submissionNonce: nonce,
      scheduledAt: "2026-08-20T10:30:00+07:00",
      type: "FOLLOW_UP",
      responsibleUserId: "77777777-7777-4777-8777-777777777777",
      durationMinutes: 30,
      locationType: "CLINIC",
      locationDetail: "ห้องตรวจ 1",
      note: "หมายเหตุสำหรับต้นแบบ",
    });
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/app/patients/${relationshipId}/appointments`);
    expect(mockedRevalidatePath).toHaveBeenCalledWith(
      `/app/patients/${relationshipId}/appointments/${appointmentId}`,
    );
  });

  it("binds the Patient acknowledgement action to SELF source and current appointment version", async () => {
    const result = await acknowledgeOwnPatientAppointmentAction(
      initialAppointmentInteractionActionState,
      acknowledgementFormData(),
    );

    expect(result).toMatchObject({ status: "SUCCESS", operation: "ACKNOWLEDGED" });
    expect(mockedAcknowledgeSelf).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      expectedUpdatedAt,
    });
    expect(mockedAcknowledgeProxy).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).toHaveBeenCalledWith(
      `/app/personal/appointments/${relationshipId}/${appointmentId}`,
    );
  });

  it("rejects client-selected acknowledgement source instead of changing SELF/OSM attribution", async () => {
    const formData = acknowledgementFormData();
    formData.set("source", "OSM_PROXY");

    const result = await acknowledgeOwnPatientAppointmentAction(
      initialAppointmentInteractionActionState,
      formData,
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedAcknowledgeSelf).not.toHaveBeenCalled();
    expect(mockedAcknowledgeProxy).not.toHaveBeenCalled();
  });

  it("binds the OSM acknowledgement endpoint to proxy attribution", async () => {
    const result = await acknowledgeAppointmentOnBehalfOfPatientAction(
      initialAppointmentInteractionActionState,
      acknowledgementFormData(),
    );

    expect(result).toMatchObject({ status: "SUCCESS", operation: "ACKNOWLEDGED" });
    expect(mockedAcknowledgeProxy).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      expectedUpdatedAt,
    });
    expect(mockedAcknowledgeSelf).not.toHaveBeenCalled();
  });

  it("validates the Patient cancellation request token and source-specific endpoint", async () => {
    const result = await requestOwnPatientAppointmentCancellationAction(
      initialAppointmentInteractionActionState,
      cancellationRequestFormData(),
    );

    expect(result).toMatchObject({ status: "SUCCESS", operation: "CANCELLATION_REQUESTED" });
    expect(mockedRequestSelf).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      expectedUpdatedAt,
      submissionNonce: nonce,
    });

    await requestAppointmentCancellationOnBehalfOfPatientAction(
      initialAppointmentInteractionActionState,
      cancellationRequestFormData(),
    );
    expect(mockedRequestProxy).toHaveBeenCalledWith(actor, expect.objectContaining({ submissionNonce: nonce }));
    expect(mockedRequestSelf).toHaveBeenCalledTimes(1);
  });

  it("validates coordination as a separate no-text action", async () => {
    const data = new FormData();
    data.set("patientHospitalRelationshipId", relationshipId);
    data.set("appointmentId", appointmentId);
    data.set("submissionNonce", nonce);

    const result = await recordAppointmentCoordinationAction(
      initialAppointmentInteractionActionState,
      data,
    );

    expect(result).toMatchObject({ status: "SUCCESS", operation: "COORDINATION_RECORDED" });
    expect(mockedCoordination).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      submissionNonce: nonce,
    });
  });

  it("binds Hospital review to the server-selected approval decision", async () => {
    const result = await approveAppointmentCancellationRequestAction(
      initialAppointmentInteractionActionState,
      cancellationReviewFormData(),
    );

    expect(result).toMatchObject({
      status: "SUCCESS",
      operation: "CANCELLATION_APPROVED",
      appointmentStatus: AppointmentStatus.CANCELLED,
    });
    expect(mockedReviewCancellation).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      requestId: "77777777-7777-4777-8777-777777777777",
      decision: "APPROVE",
    });
  });

  it.each(["unknown field", "duplicate field", "authority field"])(
    "rejects %s before invoking the create service",
    async (caseName) => {
      const data = createFormData();

      if (caseName === "unknown field") {
        data.set("hospitalId", "88888888-8888-4888-8888-888888888888");
      }

      if (caseName === "duplicate field") {
        data.append("type", "CONSULTATION");
      }

      if (caseName === "authority field") {
        data.set("status", "COMPLETED");
      }

      const result = await createAppointmentAction(initialAppointmentActionState, data);

      expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
      expect(mockedCreate).not.toHaveBeenCalled();
    },
  );

  it("maps a forbidden decision to a safe user-facing error", async () => {
    mockedCreate.mockRejectedValue(new ForbiddenError());

    await expect(createAppointmentAction(initialAppointmentActionState, createFormData())).resolves.toEqual({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์จัดการนัดหมายสำหรับผู้ป่วยรายนี้",
    });
  });

  it("parses reschedule fields without accepting a creation nonce", async () => {
    const result = await rescheduleAppointmentAction(initialAppointmentActionState, rescheduleFormData());

    expect(result).toMatchObject({ status: "SUCCESS", result: { appointmentId } });
    expect(mockedReschedule).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      expectedUpdatedAt,
      scheduledAt: "2026-08-20T10:30:00+07:00",
      type: "FOLLOW_UP",
      responsibleUserId: "77777777-7777-4777-8777-777777777777",
      durationMinutes: 30,
      locationType: "CLINIC",
      locationDetail: "ห้องตรวจ 1",
      note: "หมายเหตุสำหรับต้นแบบ",
    });
  });

  it.each([
    ["cancel", cancelAppointmentAction, mockedCancel, AppointmentStatus.CANCELLED],
    ["complete", completeAppointmentAction, mockedComplete, AppointmentStatus.COMPLETED],
    ["no-show", markAppointmentNoShowAction, mockedNoShow, AppointmentStatus.NO_SHOW],
  ] as const)("submits the %s transition with an expected version", async (_name, action, mock, status) => {
    const result = await action(initialAppointmentActionState, transitionFormData());

    expect(result).toMatchObject({ status: "SUCCESS", result: { appointmentId, status } });
    expect(mock).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      expectedUpdatedAt,
    });
  });
});
