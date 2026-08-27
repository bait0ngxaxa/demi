"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/shared/errors/application-error";

import { setPatientClassificationRequestSchema } from "../schemas/patient-classification-schemas";
import { setPatientClassification } from "../services/patient-classification-service";
import type { PatientClassificationActionState } from "./action-state";

function getSingleString(formData: FormData, field: string): string {
  const values = formData.getAll(field);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : "";
}

function mapClassificationError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof NotFoundError) {
    return {
      code: "FORBIDDEN",
      message: "ไม่พบผู้ป่วยหรือไม่อยู่ในขอบเขตที่บัญชีนี้เข้าถึงได้",
    };
  }

  if (error instanceof ForbiddenError) {
    return {
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์เปลี่ยนสถานะผู้ป่วยในโรงพยาบาลนี้",
    };
  }

  if (error instanceof ConflictError) {
    return {
      code: "CONFLICT",
      message: "สถานะผู้ป่วยเปลี่ยนแปลงแล้ว กรุณาตรวจสอบข้อมูลล่าสุดก่อนลองใหม่",
    };
  }

  if (error instanceof ApplicationError && error.code === "VALIDATION") {
    return {
      code: "INVALID_INPUT",
      message: "กรุณาเลือกสถานะผู้ป่วยที่รองรับ",
    };
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมบันทึกสถานะผู้ป่วยในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

export async function setPatientClassificationAction(
  _previousState: PatientClassificationActionState,
  formData: FormData,
): Promise<PatientClassificationActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const parsed = setPatientClassificationRequestSchema.safeParse({
      patientHospitalRelationshipId: getSingleString(formData, "patientHospitalRelationshipId"),
      classification: getSingleString(formData, "classification"),
    });

    if (!parsed.success) {
      return {
        status: "ERROR",
        code: "INVALID_INPUT",
        message: "กรุณาเลือกสถานะผู้ป่วยที่รองรับ",
      };
    }

    const result = await setPatientClassification(actor, parsed.data);
    const detailPath = `/app/patients/${encodeURIComponent(parsed.data.patientHospitalRelationshipId)}`;

    revalidatePath(detailPath);
    revalidatePath("/app/patients");
    revalidatePath("/app/patients/assigned");

    return {
      status: "SUCCESS",
      result: {
        operation: result.operation,
        classification: result.classification,
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapClassificationError(error) };
  }
}
