"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  patientProgramServiceOneConfidenceRequestSchema,
  patientProgramServiceOneDreamCardRequestSchema,
  patientProgramServiceOneFloatingChartRequestSchema,
  patientProgramServiceOneRoutineRequestSchema,
} from "../schemas/patient-program-service-one-schemas";
import {
  recordPatientProgramServiceOneConfidence,
  recordPatientProgramServiceOneDreamCard,
  recordPatientProgramServiceOneFloatingChart,
  recordPatientProgramServiceOneRoutine,
  type PatientProgramServiceOneMutationResult,
} from "../services/patient-program-service-one-service";

import type { PatientProgramServiceOneActionState } from "./patient-program-service-one-action-state";

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
}
function getSingleInteger(formData: FormData, field: string): number | undefined {
  const value = getSingleString(formData, field);

  if (value === undefined || !/^-?\d+$/u.test(value.trim())) {
    return undefined;
  }

  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function hasUnexpectedOrDuplicateFields(formData: FormData, allowedFields: ReadonlySet<string>): boolean {
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

function buildRoutineInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, new Set(["patientProgramId"]))) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
  };
}

function buildFloatingChartInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, new Set(["patientProgramId", "summary"]))) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    summary: getSingleString(formData, "summary"),
  };
}

function buildDreamCardInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, new Set(["patientProgramId", "description"]))) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    description: getSingleString(formData, "description"),
  };
}

function buildConfidenceInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, new Set(["patientProgramId", "score", "improvementPlan"]))) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
    score: getSingleInteger(formData, "score"),
    improvementPlan: getSingleString(formData, "improvementPlan"),
  };
}

function mapServiceOneError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบข้อมูลกิจกรรม Service 1 ก่อนบันทึกอีกครั้ง",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์บันทึกกิจกรรมของโปรแกรมผู้ป่วยรายนี้",
      };
    }

    if (error.code === "NOT_FOUND") {
      return {
        code: "NOT_FOUND",
        message: "ไม่พบโปรแกรมในขอบเขตที่บัญชีนี้เข้าถึงได้",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message: "กิจกรรมถูกบันทึกแล้ว หรือโปรแกรมถูกเปลี่ยนสถานะ กรุณาโหลดข้อมูลล่าสุด",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมบันทึกกิจกรรม Service 1 ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function toSuccessState(result: PatientProgramServiceOneMutationResult): PatientProgramServiceOneActionState {
  return {
    status: "SUCCESS",
    result: {
      activity: result.activity,
      operation: result.operation,
      patientProgramId: result.patientProgramId,
      patientHospitalRelationshipId: result.patientHospitalRelationshipId,
      recordedAt: result.recordedAt.toISOString(),
    },
  };
}

function revalidatePatientProgramServiceOnePaths(
  relationshipId: string,
  programId: string,
): void {
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/programs`);
  revalidatePath(`/app/patients/${relationshipId}/programs/${programId}`);
}

export async function recordPatientProgramServiceOneRoutineAction(
  _previousState: PatientProgramServiceOneActionState,
  formData: FormData,
): Promise<PatientProgramServiceOneActionState> {
  const parsed = patientProgramServiceOneRoutineRequestSchema.safeParse(buildRoutineInput(formData));

  if (!parsed.success) {
    return { status: "ERROR", ...mapServiceOneError(new ApplicationError("VALIDATION", "invalid")) };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await recordPatientProgramServiceOneRoutine(actor, parsed.data);
    revalidatePatientProgramServiceOnePaths(
      result.patientHospitalRelationshipId,
      result.patientProgramId,
    );
    return toSuccessState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapServiceOneError(error) };
  }
}

export async function recordPatientProgramServiceOneFloatingChartAction(
  _previousState: PatientProgramServiceOneActionState,
  formData: FormData,
): Promise<PatientProgramServiceOneActionState> {
  const parsed = patientProgramServiceOneFloatingChartRequestSchema.safeParse(
    buildFloatingChartInput(formData),
  );

  if (!parsed.success) {
    return { status: "ERROR", ...mapServiceOneError(new ApplicationError("VALIDATION", "invalid")) };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await recordPatientProgramServiceOneFloatingChart(actor, parsed.data);
    revalidatePatientProgramServiceOnePaths(
      result.patientHospitalRelationshipId,
      result.patientProgramId,
    );
    return toSuccessState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapServiceOneError(error) };
  }
}

export async function recordPatientProgramServiceOneDreamCardAction(
  _previousState: PatientProgramServiceOneActionState,
  formData: FormData,
): Promise<PatientProgramServiceOneActionState> {
  const parsed = patientProgramServiceOneDreamCardRequestSchema.safeParse(
    buildDreamCardInput(formData),
  );

  if (!parsed.success) {
    return { status: "ERROR", ...mapServiceOneError(new ApplicationError("VALIDATION", "invalid")) };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await recordPatientProgramServiceOneDreamCard(actor, parsed.data);
    revalidatePatientProgramServiceOnePaths(
      result.patientHospitalRelationshipId,
      result.patientProgramId,
    );
    return toSuccessState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapServiceOneError(error) };
  }
}

export async function recordPatientProgramServiceOneConfidenceAction(
  _previousState: PatientProgramServiceOneActionState,
  formData: FormData,
): Promise<PatientProgramServiceOneActionState> {
  const parsed = patientProgramServiceOneConfidenceRequestSchema.safeParse(
    buildConfidenceInput(formData),
  );

  if (!parsed.success) {
    return { status: "ERROR", ...mapServiceOneError(new ApplicationError("VALIDATION", "invalid")) };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await recordPatientProgramServiceOneConfidence(actor, parsed.data);
    revalidatePatientProgramServiceOnePaths(
      result.patientHospitalRelationshipId,
      result.patientProgramId,
    );
    return toSuccessState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapServiceOneError(error) };
  }
}
