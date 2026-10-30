"use server";

import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE,
  confirmPatientServiceRequest,
  createPatientServiceRequest,
  rejectPatientServiceRequest,
  withdrawOwnPatientServiceRequest,
} from "../services/patient-service-request-service";
import { setHospitalServiceOffering } from "../services/patient-service-catalog-service";
import {
  hospitalServiceOfferingMutationSchema,
  patientServiceRequestConfirmSchema,
  patientServiceRequestCreateSchema,
  patientServiceRequestIdSchema,
  patientServiceRequestRejectSchema,
} from "../schemas/patient-service-request-schemas";
import type { PatientServiceMutationActionState } from "./action-state";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function mapMutationError(error: unknown): PatientServiceMutationActionState {
  if (error instanceof ApplicationError) {
    if (error.code === "FORBIDDEN") {
      return { status: "ERROR", message: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการในขอบเขตนี้" };
    }

    if (error.code === "NOT_FOUND") {
      return { status: "ERROR", message: "ไม่พบรายการที่ต้องการดำเนินการ" };
    }

    if (error.code === "CONFLICT" && error.message === DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE) {
      return { status: "ERROR", message: DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE };
    }

    if (error.code === "CONFLICT") {
      return { status: "ERROR", message: "คำขอซ้ำหรือสถานะเปลี่ยนไปแล้ว กรุณาตรวจสอบรายการอีกครั้ง" };
    }

    if (error.code === "VALIDATION" && error.message.startsWith("The preferred date")) {
      return { status: "ERROR", message: "วันที่สะดวกต้องอยู่ระหว่างพรุ่งนี้ถึง 60 วันข้างหน้า" };
    }

    if (error.code === "VALIDATION" && error.message.startsWith("The appointment time")) {
      return { status: "ERROR", message: "วันเวลานัดต้องเป็นเวลาในอนาคต" };
    }

    if (error.code === "VALIDATION") {
      return { status: "ERROR", message: "กรุณาตรวจสอบข้อมูลที่เลือกแล้วลองอีกครั้ง" };
    }
  }

  return { status: "ERROR", message: "ระบบไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง" };
}

export async function setHospitalServiceOfferingAction(
  _previousState: PatientServiceMutationActionState,
  formData: FormData,
): Promise<PatientServiceMutationActionState> {
  const enabledValue = formString(formData, "enabled");
  const parsed = hospitalServiceOfferingMutationSchema.safeParse({
    hospitalId: formString(formData, "hospitalId"),
    code: formString(formData, "code"),
    enabled: enabledValue === "true" ? true : enabledValue === "false" ? false : undefined,
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "กรุณาตรวจสอบรายการบริการที่เลือก" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await setHospitalServiceOffering(actor, parsed.data);
    revalidatePath("/app/patients/service-catalog");
    revalidatePath("/app/patients/service-requests");
    revalidatePath("/app/personal/services");
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapMutationError(error);
  }
}

export async function createPatientServiceRequestAction(
  _previousState: PatientServiceMutationActionState,
  formData: FormData,
): Promise<PatientServiceMutationActionState> {
  const preferredOsmRelationshipId = formString(formData, "preferredOsmRelationshipId");
  const parsed = patientServiceRequestCreateSchema.safeParse({
    relationshipId: formString(formData, "relationshipId"),
    offeringId: formString(formData, "offeringId"),
    preferredOsmRelationshipId: preferredOsmRelationshipId || null,
    preferredDate: formString(formData, "preferredDate"),
    preferredSlot: formString(formData, "preferredSlot"),
    note: formString(formData, "note"),
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "กรุณาเลือกบริการ วันที่และช่วงเวลาที่สะดวก" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await createPatientServiceRequest(actor, parsed.data);
    revalidatePath("/app/personal/services");
    revalidatePath("/app/personal");
    revalidatePath("/app/patients/service-requests");
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapMutationError(error);
  }
}

export async function withdrawOwnPatientServiceRequestAction(
  _previousState: PatientServiceMutationActionState,
  formData: FormData,
): Promise<PatientServiceMutationActionState> {
  const parsed = patientServiceRequestIdSchema.safeParse({
    requestId: formString(formData, "requestId"),
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "ไม่พบคำขอที่ต้องการถอน" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await withdrawOwnPatientServiceRequest(actor, parsed.data);
    revalidatePath("/app/personal/services");
    revalidatePath("/app/patients/service-requests");
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapMutationError(error);
  }
}

function conflictState(error: unknown): PatientServiceMutationActionState {
  const state = mapMutationError(error);
  if (state.status === "ERROR" && error instanceof ApplicationError && error.code === "CONFLICT") {
    revalidatePath("/app/patients/service-requests");
    return { ...state, conflict: true };
  }
  return state;
}

function optionalInteger(value: string): number | null {
  if (!value.trim()) return null;
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
}

export async function confirmPatientServiceRequestAction(
  _previousState: PatientServiceMutationActionState,
  formData: FormData,
): Promise<PatientServiceMutationActionState> {
  const parsed = patientServiceRequestConfirmSchema.safeParse({
    requestId: formString(formData, "requestId"),
    scheduledAt: formString(formData, "scheduledAt"),
    durationMinutes: optionalInteger(formString(formData, "durationMinutes")),
    locationDetail: formString(formData, "locationDetail") || null,
    osmUserId: formString(formData, "osmUserId"),
    note: formString(formData, "note") || null,
    submissionNonce: formString(formData, "submissionNonce"),
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "กรุณาเลือกวันเวลานัดและ อสม. ผู้ไปเยี่ยมให้ครบ" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await confirmPatientServiceRequest(actor, parsed.data);
    revalidatePath("/app/patients/service-requests");
    revalidatePath("/app/personal/services");
    revalidatePath("/app/appointments");
    revalidatePath(`/app/patients/${result.patientHospitalRelationshipId}/appointments`);
    return { status: "SUCCESS", message: "ยืนยันนัดแล้ว ระบบแจ้ง อสม. ผู้ไปเยี่ยมให้ตอบรับนัด", appointment: { relationshipId: result.patientHospitalRelationshipId, appointmentId: result.appointmentId } };
  } catch (error: unknown) {
    return conflictState(error);
  }
}

export async function rejectPatientServiceRequestAction(
  _previousState: PatientServiceMutationActionState,
  formData: FormData,
): Promise<PatientServiceMutationActionState> {
  const parsed = patientServiceRequestRejectSchema.safeParse({
    requestId: formString(formData, "requestId"),
    reason: formString(formData, "reason"),
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "กรุณาระบุเหตุผลที่ไม่อนุมัติ (ไม่เกิน 500 ตัวอักษร)" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await rejectPatientServiceRequest(actor, parsed.data);
    revalidatePath("/app/patients/service-requests");
    revalidatePath("/app/personal/services");
    return { status: "SUCCESS", message: "บันทึกผลไม่อนุมัติแล้ว ผู้ป่วยจะเห็นเหตุผลนี้" };
  } catch (error: unknown) {
    return conflictState(error);
  }
}
