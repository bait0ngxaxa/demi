"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  patientProgramCompleteRequestSchema,
  patientProgramOpenRequestSchema,
} from "../schemas/patient-program-schemas";
import {
  completePatientProgram,
  openPatientProgram,
  type PatientProgramMutationResult,
} from "../services/patient-program-service";

import type { PatientProgramActionState } from "./action-state";

function getSingleString(formData: FormData, field: string): string | undefined {
  const values = formData.getAll(field);

  if (values.length !== 1 || typeof values[0] !== "string") {
    return undefined;
  }

  return values[0];
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

function buildOpenInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, new Set(["patientHospitalRelationshipId"]))) {
    return null;
  }

  return {
    patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
  };
}

function buildCompleteInput(formData: FormData): unknown {
  if (hasUnexpectedOrDuplicateFields(formData, new Set(["patientProgramId"]))) {
    return null;
  }

  return {
    patientProgramId: getSingleString(formData, "patientProgramId"),
  };
}

function mapProgramError(
  error: unknown,
  operation: "open" | "complete",
): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message:
          operation === "open"
            ? "ไม่พบความสัมพันธ์ผู้ป่วยที่ถูกต้องสำหรับการเปิดโปรแกรม"
            : "ไม่พบโปรแกรมที่ถูกต้องสำหรับการดำเนินการ",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการกับโปรแกรมของผู้ป่วยรายนี้",
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
        message:
          operation === "open"
            ? "ผู้ป่วยรายนี้มีโปรแกรมที่กำลังดำเนินการอยู่แล้ว หรือมีคำขออื่นกำลังบันทึกอยู่ กรุณาโหลดหน้าใหม่"
            : "โปรแกรมถูกเปลี่ยนสถานะแล้ว กรุณาโหลดหน้าใหม่เพื่อตรวจสอบข้อมูลล่าสุด",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมดำเนินการกับโปรแกรมในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function toSuccessState(result: PatientProgramMutationResult): PatientProgramActionState {
  return {
    status: "SUCCESS",
    result: {
      operation: result.operation,
      patientProgramId: result.patientProgramId,
      patientHospitalRelationshipId: result.patientHospitalRelationshipId,
      status: result.status,
      startedAt: result.startedAt.toISOString(),
      completedAt: result.completedAt?.toISOString() ?? null,
    },
  };
}

function revalidatePatientProgramPaths(relationshipId: string, programId?: string): void {
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/programs`);

  if (programId) {
    revalidatePath(`/app/patients/${relationshipId}/programs/${programId}`);
  }
}

export async function openPatientProgramAction(
  _previousState: PatientProgramActionState,
  formData: FormData,
): Promise<PatientProgramActionState> {
  const parsed = patientProgramOpenRequestSchema.safeParse(buildOpenInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่พบความสัมพันธ์ผู้ป่วยที่ถูกต้องสำหรับการเปิดโปรแกรม",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await openPatientProgram(actor, parsed.data);
    revalidatePatientProgramPaths(result.patientHospitalRelationshipId, result.patientProgramId);
    return toSuccessState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapProgramError(error, "open") };
  }
}

export async function completePatientProgramAction(
  _previousState: PatientProgramActionState,
  formData: FormData,
): Promise<PatientProgramActionState> {
  const parsed = patientProgramCompleteRequestSchema.safeParse(buildCompleteInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่พบโปรแกรมที่ถูกต้องสำหรับการดำเนินการ",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await completePatientProgram(actor, parsed.data);
    revalidatePatientProgramPaths(result.patientHospitalRelationshipId, result.patientProgramId);
    return toSuccessState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapProgramError(error, "complete") };
  }
}
