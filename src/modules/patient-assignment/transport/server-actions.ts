"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  patientOsmAssignmentRequestSchema,
  patientOsmBulkAssignmentRequestSchema,
  patientOsmUnassignmentRequestSchema,
} from "../schemas/patient-osm-assignment-schemas";
import {
  assignOsmToPatient,
  assignOsmToPatients,
  unassignOsmFromPatient,
} from "../services/patient-osm-assignment-service";

import type {
  PatientOsmAssignmentActionState,
  PatientOsmBulkAssignmentActionState,
} from "./action-state";

function getString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function mapAssignmentError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบผู้ป่วยและ อสม. ที่เลือกให้ถูกต้อง",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์จัดการการมอบหมายผู้ป่วย",
      };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return {
        code: "CONFLICT",
        message: "ข้อมูลการมอบหมายเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าแล้วลองใหม่",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมดำเนินการในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function revalidatePatientAssignmentPaths(relationshipId: string): void {
  revalidatePath("/app/patients");
  revalidatePath("/app/patients/assigned");
  revalidatePath(`/app/patients/${relationshipId}`);
  revalidatePath(`/app/patients/${relationshipId}/assignment`);
}

export async function assignOsmToPatientAction(
  _previousState: PatientOsmAssignmentActionState,
  formData: FormData,
): Promise<PatientOsmAssignmentActionState> {
  const input = {
    patientHospitalRelationshipId: getString(formData, "patientHospitalRelationshipId"),
    osmUserId: getString(formData, "osmUserId"),
  };
  const parsed = patientOsmAssignmentRequestSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาเลือก อสม. ที่ต้องการมอบหมาย",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await assignOsmToPatient(actor, parsed.data);
    revalidatePatientAssignmentPaths(parsed.data.patientHospitalRelationshipId);
    return { status: "SUCCESS", result };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapAssignmentError(error) };
  }
}

function mapBulkAssignmentError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message:
          "บางรายการมี อสม. ผู้รับผิดชอบแล้วหรือข้อมูลเปลี่ยนแปลง ระบบไม่บันทึกรายการใดเลย กรุณาโหลดหน้าแล้วเลือกใหม่",
      };
    }

    if (error.code === "NOT_FOUND") {
      return {
        code: "CONFLICT",
        message: "ไม่พบผู้ป่วยบางรายที่เลือก ระบบไม่บันทึกรายการใดเลย กรุณาโหลดหน้าแล้วเลือกใหม่",
      };
    }
  }

  return mapAssignmentError(error);
}

export async function bulkAssignOsmToPatientsAction(
  _previousState: PatientOsmBulkAssignmentActionState,
  formData: FormData,
): Promise<PatientOsmBulkAssignmentActionState> {
  const parsed = patientOsmBulkAssignmentRequestSchema.safeParse({
    hospitalId: getString(formData, "hospitalId"),
    osmUserId: getString(formData, "osmUserId"),
    submissionNonce: getString(formData, "submissionNonce"),
    patientHospitalRelationshipIds: formData
      .getAll("patientHospitalRelationshipId")
      .filter((value): value is string => typeof value === "string"),
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาเลือกผู้ป่วยไม่เกิน 500 คน และเลือก อสม. ที่ต้องการมอบหมาย",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await assignOsmToPatients(actor, parsed.data);
    revalidatePath("/app/patients");
    revalidatePath("/app/patients/assigned");
    revalidatePath("/app/patients/assign-osm");
    return { status: "SUCCESS", result };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapBulkAssignmentError(error) };
  }
}

export async function unassignOsmFromPatientAction(
  _previousState: PatientOsmAssignmentActionState,
  formData: FormData,
): Promise<PatientOsmAssignmentActionState> {
  const input = {
    patientHospitalRelationshipId: getString(formData, "patientHospitalRelationshipId"),
  };
  const parsed = patientOsmUnassignmentRequestSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่พบผู้ป่วยที่ต้องการยกเลิกการมอบหมาย",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await unassignOsmFromPatient(actor, parsed.data);
    revalidatePatientAssignmentPaths(parsed.data.patientHospitalRelationshipId);
    return { status: "SUCCESS", result };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapAssignmentError(error) };
  }
}
