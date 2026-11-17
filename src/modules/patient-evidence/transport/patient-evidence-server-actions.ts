"use server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { removePatientEvidenceArtifact } from "../services/patient-evidence-service";

/**
 * `code` classifies an ERROR so the UI never compares message text. UNAVAILABLE covers every unexpected failure and
 * is not proof that the removal did not commit; the page reloads its list to show the current state.
 */
export type PatientEvidenceRemoveErrorCode =
  | "INVALID_INPUT"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UNAUTHENTICATED"
  | "UNAVAILABLE";

export type PatientEvidenceRemoveActionState =
  | { status: "IDLE"; message: "" }
  | { status: "SUCCESS"; message: string }
  | { status: "ERROR"; message: string; code: PatientEvidenceRemoveErrorCode };

/** N4 (ADR-0034): soft-removes one evidence photo with a required reason; the server re-checks every rule. */
export async function removePatientEvidenceArtifactAction(
  relationshipId: string,
  artifactId: string,
  _state: PatientEvidenceRemoveActionState,
  formData: FormData,
): Promise<PatientEvidenceRemoveActionState> {
  const reason = formData.get("reason");

  try {
    const actor = await getProtectedApplicationActor();
    await removePatientEvidenceArtifact(actor, {
      artifactId,
      relationshipId,
      reason: typeof reason === "string" ? reason : "",
    });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { status: "ERROR", code: "INVALID_INPUT", message: "กรุณาระบุเหตุผลที่ลบ (ไม่เกิน 500 ตัวอักษร)" };
    }

    if (error instanceof ConflictError) {
      return { status: "ERROR", code: "CONFLICT", message: error.message };
    }

    if (error instanceof UnauthenticatedError) {
      return { status: "ERROR", code: "UNAUTHENTICATED", message: "กรุณาเข้าสู่ระบบใหม่" };
    }

    if (error instanceof NotFoundError) {
      return { status: "ERROR", code: "NOT_FOUND", message: "ไม่พบรูปหลักฐานนี้ในขอบเขตที่เข้าถึงได้ กรุณาโหลดหน้าใหม่" };
    }

    if (error instanceof ForbiddenError) {
      return { status: "ERROR", code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์ลบรูปหลักฐานนี้" };
    }

    return { status: "ERROR", code: "UNAVAILABLE", message: "ลบรูปไม่สำเร็จ กรุณาโหลดหน้าใหม่เพื่อตรวจสอบก่อนลองอีกครั้ง" };
  }

  return { status: "SUCCESS", message: "ลบรูปหลักฐานแล้ว" };
}
