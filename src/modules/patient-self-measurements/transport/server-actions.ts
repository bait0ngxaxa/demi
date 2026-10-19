"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";
import {
  getPatientSelfLoginHref,
  PATIENT_SELF_SESSION_EXPIRED_MESSAGE,
} from "@/modules/patient-self/transport/patient-self-session";

import {
  createOwnPatientSelfMeasurement,
  deleteOwnPatientSelfMeasurement,
} from "../services/patient-self-measurement-service";

export type PatientSelfMeasurementActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; message: string }
  | { status: "ERROR"; message: string; loginHref?: string };

function formNumber(formData: FormData, key: string): number | null | string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** `measuredAt` arrives as a Thailand local `datetime-local` value. */
function bangkokDateTime(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value) ? `${value}:00+07:00` : value;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") return "กรุณาตรวจสอบค่าที่บันทึกและวันเวลา หากบันทึกน้ำตาลให้ใช้หน่วย mg/dL (ไม่เป็นอนาคตและไม่เกิน 1 ปีย้อนหลัง)";
    if (error.code === "FORBIDDEN") return "บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลนี้";
    if (error.code === "UNAUTHENTICATED") return PATIENT_SELF_SESSION_EXPIRED_MESSAGE;
    if (error.code === "NOT_FOUND") return "ไม่พบรายการนี้";
    if (error.code === "CONFLICT") return "รายการนี้ลบไม่ได้แล้ว (ลบได้ภายใน 24 ชั่วโมงหลังบันทึก)";
  }
  return fallback;
}

async function errorState(error: unknown, fallback: string): Promise<PatientSelfMeasurementActionState> {
  const message = errorMessage(error, fallback);

  return error instanceof ApplicationError && error.code === "UNAUTHENTICATED"
    ? { status: "ERROR", message, loginHref: getPatientSelfLoginHref("/app/personal/measurements") }
    : { status: "ERROR", message };
}

export async function createOwnPatientSelfMeasurementAction(
  _previous: PatientSelfMeasurementActionState,
  formData: FormData,
): Promise<PatientSelfMeasurementActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const bloodSugarUnit = formString(formData, "bloodSugarUnit");
    const result = await createOwnPatientSelfMeasurement(actor, {
      submissionNonce: formString(formData, "submissionNonce"),
      measuredAt: bangkokDateTime(formString(formData, "measuredAt")),
      weight: formNumber(formData, "weight"),
      systolicBloodPressure: formNumber(formData, "systolicBloodPressure"),
      diastolicBloodPressure: formNumber(formData, "diastolicBloodPressure"),
      bloodSugar: formNumber(formData, "bloodSugar"),
      ...(bloodSugarUnit ? { bloodSugarUnit } : {}),
      note: formString(formData, "note"),
    });
    revalidatePath("/app/personal/measurements");
    return { status: "SUCCESS", message: result.outcome === "REPLAY" ? "บันทึกรายการนี้ไว้แล้ว" : "บันทึกแล้ว" };
  } catch (error: unknown) {
    return errorState(error, "บันทึกไม่ได้ กรุณาลองใหม่อีกครั้ง");
  }
}

export async function deleteOwnPatientSelfMeasurementAction(
  _previous: PatientSelfMeasurementActionState,
  formData: FormData,
): Promise<PatientSelfMeasurementActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await deleteOwnPatientSelfMeasurement(actor, formString(formData, "measurementId"));
    revalidatePath("/app/personal/measurements");
    return { status: "SUCCESS", message: "ลบรายการแล้ว" };
  } catch (error: unknown) {
    return errorState(error, "ลบไม่ได้ กรุณาลองใหม่อีกครั้ง");
  }
}
