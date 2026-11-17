"use server";

import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import {
  getPatientSelfLoginHref,
  PATIENT_SELF_SESSION_EXPIRED_MESSAGE,
} from "@/modules/patient-self/transport/patient-self-session";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  appointmentCreateRequestSchema,
  appointmentAcknowledgementRequestSchema,
  appointmentAssignmentAcceptanceRequestSchema,
  appointmentCancellationRequestSchema,
  appointmentCancellationReviewRequestSchema,
  appointmentCoordinationRequestSchema,
  appointmentRescheduleRequestSchema,
  appointmentTransitionRequestSchema,
} from "../schemas/appointment-schemas";
import {
  acknowledgeAppointmentOnBehalfOfPatient,
  acknowledgeOwnPatientAppointment,
  acceptAppointmentAssignment,
  cancelAppointment,
  completeAppointment,
  createAppointment,
  markAppointmentNoShow,
  recordAppointmentCoordination,
  rescheduleAppointment,
  requestAppointmentCancellationOnBehalfOfPatient,
  requestOwnPatientAppointmentCancellation,
  reviewAppointmentCancellationRequest,
  type AppointmentMutationResult,
} from "../services/appointment-service";

import type {
  AppointmentActionState,
  AppointmentInteractionActionState,
} from "./action-state";
import {
  buildAcknowledgementInput,
  buildAssignmentAcceptanceInput,
  buildCancellationRequestInput,
  buildCancellationReviewInput,
  buildCoordinationInput,
  buildCreateInput,
  buildRescheduleInput,
  buildTransitionInput,
} from "./appointment-form-input";

function mapAppointmentError(error: unknown, operation: "create" | "reschedule" | "transition" | "interaction"): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message:
          operation === "transition"
            ? "ข้อมูลการเปลี่ยนสถานะไม่ถูกต้อง กรุณาเปิดรายละเอียดนัดหมายอีกครั้ง"
            : "กรุณาตรวจสอบวันเวลา ประเภท และรายละเอียดนัดหมายก่อนส่งอีกครั้ง",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์จัดการนัดหมายสำหรับผู้ป่วยรายนี้",
      };
    }

    if (error.code === "NOT_FOUND") {
      return {
        code: "NOT_FOUND",
        message: "ไม่พบนัดหมายในขอบเขตที่บัญชีนี้เข้าถึงได้",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message:
          operation === "transition"
            ? "ไม่สามารถเปลี่ยนสถานะได้ อาจยังไม่ถึงเวลานัดหรือข้อมูลเปลี่ยนแปลงแล้ว กรุณาเปิดรายละเอียดอีกครั้ง"
            : "นัดหมายถูกบันทึกหรือเปลี่ยนแปลงแล้ว กรุณาเปิดรายละเอียดอีกครั้ง",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมบันทึกนัดหมายในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function toSuccessState(result: AppointmentMutationResult): AppointmentActionState {
  return {
    status: "SUCCESS",
    result: {
      appointmentId: result.appointmentId,
      patientHospitalRelationshipId: result.patientHospitalRelationshipId,
      status: result.status,
      updatedAt: result.updatedAt.toISOString(),
    },
  };
}

function revalidateAppointmentPaths(relationshipId: string, appointmentId?: string): void {
  revalidatePath("/app", "layout");
  revalidatePath("/app/appointments");
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/appointments`);

  if (appointmentId) {
    revalidatePath(`/app/patients/${relationshipId}/appointments/${appointmentId}`);
    revalidatePath(`/app/patients/${relationshipId}/appointments/${appointmentId}/edit`);
  }
}

function revalidatePatientAppointmentPaths(relationshipId: string, appointmentId: string): void {
  revalidatePath("/app", "layout");
  revalidatePath("/app/personal");
  revalidatePath("/app/personal/appointments");
  revalidatePath(`/app/personal/appointments/${relationshipId}`);
  revalidatePath(`/app/personal/appointments/${relationshipId}/${appointmentId}`);
}

type AppointmentInteractionSuccess = Omit<
  Extract<AppointmentInteractionActionState, { status: "SUCCESS" }>,
  "status"
>;

type AppointmentInteractionOperation = (
  actor: ActorContext,
  input: unknown,
) => Promise<AppointmentInteractionSuccess>;

async function runInteractionAction(
  previousState: AppointmentInteractionActionState,
  rawInput: unknown,
  schema: ZodType<unknown>,
  operation: AppointmentInteractionOperation,
  audience: "self" | "work",
): Promise<AppointmentInteractionActionState> {
  void previousState;
  const parsed = schema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลนัดหมาย แล้วลองอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await operation(actor, parsed.data);

    if (audience === "self") {
      revalidatePatientAppointmentPaths(result.patientHospitalRelationshipId, result.appointmentId);
    } else {
      revalidateAppointmentPaths(result.patientHospitalRelationshipId, result.appointmentId);
    }

    return { status: "SUCCESS", ...result };
  } catch (error: unknown) {
    if (audience === "self" && error instanceof ApplicationError && error.code === "UNAUTHENTICATED") {
      return {
        status: "ERROR",
        code: "UNAUTHENTICATED",
        message: PATIENT_SELF_SESSION_EXPIRED_MESSAGE,
        loginHref: getPatientSelfLoginHref(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_APPOINTMENTS),
      };
    }

    return { status: "ERROR", ...mapAppointmentError(error, "interaction") };
  }
}

export async function createAppointmentAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const rawInput = buildCreateInput(formData);
  const parsed = appointmentCreateRequestSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบวันเวลา ประเภท และรายละเอียดนัดหมายก่อนส่งอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await createAppointment(actor, parsed.data);
    revalidateAppointmentPaths(result.patientHospitalRelationshipId, result.appointmentId);
    return toSuccessState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapAppointmentError(error, "create") };
  }
}

export async function rescheduleAppointmentAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const rawInput = buildRescheduleInput(formData);
  const parsed = appointmentRescheduleRequestSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบวันเวลา ประเภท และรายละเอียดนัดหมายก่อนส่งอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await rescheduleAppointment(actor, parsed.data);
    revalidateAppointmentPaths(result.patientHospitalRelationshipId, result.appointmentId);
    return toSuccessState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapAppointmentError(error, "reschedule") };
  }
}

type AppointmentTransitionService = (
  actor: ActorContext,
  input: unknown,
) => Promise<AppointmentMutationResult>;

async function runTransitionAction(
  previousState: AppointmentActionState,
  formData: FormData,
  operation: AppointmentTransitionService,
): Promise<AppointmentActionState> {
  void previousState;
  const rawInput = buildTransitionInput(formData);
  const parsed = appointmentTransitionRequestSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลการเปลี่ยนสถานะไม่ถูกต้อง กรุณาเปิดรายละเอียดนัดหมายอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await operation(actor, parsed.data);
    revalidateAppointmentPaths(result.patientHospitalRelationshipId, result.appointmentId);
    return toSuccessState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapAppointmentError(error, "transition") };
  }
}

export async function cancelAppointmentAction(
  previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  return runTransitionAction(previousState, formData, cancelAppointment);
}

export async function completeAppointmentAction(
  previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  return runTransitionAction(previousState, formData, completeAppointment);
}

export async function markAppointmentNoShowAction(
  previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  return runTransitionAction(previousState, formData, markAppointmentNoShow);
}

export async function acknowledgeOwnPatientAppointmentAction(
  previousState: AppointmentInteractionActionState,
  formData: FormData,
): Promise<AppointmentInteractionActionState> {
  return runInteractionAction(
    previousState,
    buildAcknowledgementInput(formData),
    appointmentAcknowledgementRequestSchema,
    async (actor, input) => {
      const result = await acknowledgeOwnPatientAppointment(actor, input);
      return {
        operation: "ACKNOWLEDGED",
        appointmentId: result.appointmentId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
      };
    },
    "self",
  );
}

export async function acknowledgeAppointmentOnBehalfOfPatientAction(
  previousState: AppointmentInteractionActionState,
  formData: FormData,
): Promise<AppointmentInteractionActionState> {
  return runInteractionAction(
    previousState,
    buildAcknowledgementInput(formData),
    appointmentAcknowledgementRequestSchema,
    async (actor, input) => {
      const result = await acknowledgeAppointmentOnBehalfOfPatient(actor, input);
      return {
        operation: "ACKNOWLEDGED",
        appointmentId: result.appointmentId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
      };
    },
    "work",
  );
}

export async function acceptAppointmentAssignmentAction(
  previousState: AppointmentInteractionActionState,
  formData: FormData,
): Promise<AppointmentInteractionActionState> {
  return runInteractionAction(
    previousState,
    buildAssignmentAcceptanceInput(formData),
    appointmentAssignmentAcceptanceRequestSchema,
    async (actor, input) => {
      const result = await acceptAppointmentAssignment(actor, input);
      return {
        operation: "ASSIGNMENT_ACCEPTED",
        appointmentId: result.appointmentId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
      };
    },
    "work",
  );
}

export async function requestOwnPatientAppointmentCancellationAction(
  previousState: AppointmentInteractionActionState,
  formData: FormData,
): Promise<AppointmentInteractionActionState> {
  return runInteractionAction(
    previousState,
    buildCancellationRequestInput(formData),
    appointmentCancellationRequestSchema,
    async (actor, input) => {
      const result = await requestOwnPatientAppointmentCancellation(actor, input);
      return {
        operation: "CANCELLATION_REQUESTED",
        appointmentId: result.appointmentId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
      };
    },
    "self",
  );
}

export async function requestAppointmentCancellationOnBehalfOfPatientAction(
  previousState: AppointmentInteractionActionState,
  formData: FormData,
): Promise<AppointmentInteractionActionState> {
  return runInteractionAction(
    previousState,
    buildCancellationRequestInput(formData),
    appointmentCancellationRequestSchema,
    async (actor, input) => {
      const result = await requestAppointmentCancellationOnBehalfOfPatient(actor, input);
      return {
        operation: "CANCELLATION_REQUESTED",
        appointmentId: result.appointmentId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
      };
    },
    "work",
  );
}

export async function recordAppointmentCoordinationAction(
  previousState: AppointmentInteractionActionState,
  formData: FormData,
): Promise<AppointmentInteractionActionState> {
  return runInteractionAction(
    previousState,
    buildCoordinationInput(formData),
    appointmentCoordinationRequestSchema,
    async (actor, input) => {
      const result = await recordAppointmentCoordination(actor, input);
      return {
        operation: "COORDINATION_RECORDED",
        appointmentId: result.appointmentId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
      };
    },
    "work",
  );
}

async function reviewAppointmentCancellationRequestAction(
  previousState: AppointmentInteractionActionState,
  formData: FormData,
  decision: "APPROVE" | "REJECT",
): Promise<AppointmentInteractionActionState> {
  return runInteractionAction(
    previousState,
    buildCancellationReviewInput(formData, decision),
    appointmentCancellationReviewRequestSchema,
    async (actor, input) => {
      const result = await reviewAppointmentCancellationRequest(actor, input);
      const operation = result.wasSuperseded || result.requestStatus === "SUPERSEDED"
        ? "CANCELLATION_SUPERSEDED"
        : result.requestStatus === "APPROVED"
          ? "CANCELLATION_APPROVED"
          : "CANCELLATION_REJECTED";

      return {
        operation,
        appointmentId: result.appointmentId,
        patientHospitalRelationshipId: result.patientHospitalRelationshipId,
        appointmentStatus: result.appointmentStatus,
        updatedAt: result.updatedAt.toISOString(),
      };
    },
    "work",
  );
}

export async function approveAppointmentCancellationRequestAction(
  previousState: AppointmentInteractionActionState,
  formData: FormData,
): Promise<AppointmentInteractionActionState> {
  return reviewAppointmentCancellationRequestAction(previousState, formData, "APPROVE");
}

export async function rejectAppointmentCancellationRequestAction(
  previousState: AppointmentInteractionActionState,
  formData: FormData,
): Promise<AppointmentInteractionActionState> {
  return reviewAppointmentCancellationRequestAction(previousState, formData, "REJECT");
}

