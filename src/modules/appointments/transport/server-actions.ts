"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  appointmentCreateRequestSchema,
  appointmentRescheduleRequestSchema,
  appointmentTransitionRequestSchema,
} from "../schemas/appointment-schemas";
import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  markAppointmentNoShow,
  rescheduleAppointment,
  type AppointmentMutationResult,
} from "../services/appointment-service";

import type { AppointmentActionState } from "./action-state";

const CREATE_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "submissionNonce",
  "scheduledAt",
  "type",
  "responsibleUserId",
  "durationMinutes",
  "locationType",
  "locationDetail",
  "note",
]);

const RESCHEDULE_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "appointmentId",
  "expectedUpdatedAt",
  "scheduledAt",
  "type",
  "responsibleUserId",
  "durationMinutes",
  "locationType",
  "locationDetail",
  "note",
]);

const TRANSITION_FORM_FIELDS = new Set([
  "patientHospitalRelationshipId",
  "appointmentId",
  "expectedUpdatedAt",
]);

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
}

function getOptionalString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length === 0) {
    return undefined;
  }

  return values.length === 1 && typeof values[0] === "string" ? values[0] : undefined;
}

function getNullableString(formData: FormData, field: string): string | null | undefined {
  const value = getOptionalString(formData, field);

  if (value === undefined) {
    return undefined;
  }

  return value.trim() ? value.trim() : null;
}

function getNullableUuid(formData: FormData, field: string): string | null | undefined {
  return getNullableString(formData, field);
}

function getNullableInteger(formData: FormData, field: string): number | null | undefined {
  const value = getOptionalString(formData, field);

  if (value === undefined) {
    return undefined;
  }

  if (value.trim() === "") {
    return null;
  }

  return Number(value);
}

function hasUnexpectedOrDuplicateFields(formData: FormData, allowedFields: Set<string>): boolean {
  const seen = new Set<string>();

  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION_")) {
      continue;
    }

    if (!allowedFields.has(key) || seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function buildCreateInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, CREATE_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    submissionNonce: getSingleString(formData, "submissionNonce"),
    scheduledAt: getSingleString(formData, "scheduledAt"),
    type: getSingleString(formData, "type"),
    responsibleUserId: getNullableUuid(formData, "responsibleUserId"),
    durationMinutes: getNullableInteger(formData, "durationMinutes"),
    locationType: getNullableString(formData, "locationType"),
    locationDetail: getNullableString(formData, "locationDetail"),
    note: getNullableString(formData, "note"),
  } satisfies Record<string, unknown>;
}

function buildRescheduleInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, RESCHEDULE_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    appointmentId: getSingleString(formData, "appointmentId"),
    expectedUpdatedAt: getSingleString(formData, "expectedUpdatedAt"),
    scheduledAt: getSingleString(formData, "scheduledAt"),
    type: getSingleString(formData, "type"),
    responsibleUserId: getNullableUuid(formData, "responsibleUserId"),
    durationMinutes: getNullableInteger(formData, "durationMinutes"),
    locationType: getNullableString(formData, "locationType"),
    locationDetail: getNullableString(formData, "locationDetail"),
    note: getNullableString(formData, "note"),
  } satisfies Record<string, unknown>;
}

function buildTransitionInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, TRANSITION_FORM_FIELDS)) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
    appointmentId: getSingleString(formData, "appointmentId"),
    expectedUpdatedAt: getSingleString(formData, "expectedUpdatedAt"),
  } satisfies Record<string, unknown>;
}

function mapAppointmentError(error: unknown, operation: "create" | "reschedule" | "transition"): {
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
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/appointments`);

  if (appointmentId) {
    revalidatePath(`/app/patients/${relationshipId}/appointments/${appointmentId}`);
    revalidatePath(`/app/patients/${relationshipId}/appointments/${appointmentId}/edit`);
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

