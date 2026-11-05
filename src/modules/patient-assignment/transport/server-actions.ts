"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  patientOsmAssignmentRequestSchema,
  patientOsmBulkAssignmentRequestSchema,
  patientOsmUnassignmentRequestSchema,
} from "../schemas/patient-osm-assignment-schemas";
import { listPatientOsmBulkCandidates } from "../services/patient-osm-assignment-query-service";
import { BulkAssignmentSelectionUnavailableError } from "../services/patient-osm-bulk-assignment-errors";
import {
  assignOsmToPatient,
  assignOsmToPatients,
  unassignOsmFromPatient,
} from "../services/patient-osm-assignment-service";

import type {
  PatientOsmAssignmentActionState,
  PatientOsmBulkAssignmentActionState,
  PatientOsmBulkCandidateSearchResult,
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
  unavailableRelationshipIds?: string[];
} {
  if (error instanceof BulkAssignmentSelectionUnavailableError) {
    return {
      code: "CONFLICT",
      message: `ผู้ป่วย ${error.unavailableRelationshipIds.length} คนที่เลือกมี อสม. ผู้รับผิดชอบแล้วหรือไม่อยู่ในความดูแลของโรงพยาบาลนี้แล้ว ระบบไม่บันทึกรายการใดเลย และนำออกจากรายการที่เลือกให้แล้ว กรุณาตรวจสอบแล้วยืนยันอีกครั้ง`,
      unavailableRelationshipIds: [...error.unavailableRelationshipIds],
    };
  }

  if (error instanceof ApplicationError) {
    if (error.code === "CONFLICT") {
      return {
        code: "CONFLICT",
        message:
          "บางรายการมี อสม. ผู้รับผิดชอบแล้วหรือข้อมูลเปลี่ยนแปลง ระบบไม่บันทึกรายการใดเลย รายการที่เลือกยังอยู่ครบ กรุณากลับไปแก้ไขรายการที่เลือกแล้วลองใหม่",
      };
    }

    if (error.code === "NOT_FOUND") {
      return {
        code: "CONFLICT",
        message:
          "ไม่พบผู้ป่วยบางรายที่เลือก ระบบไม่บันทึกรายการใดเลย รายการที่เลือกยังอยู่ครบ กรุณากลับไปแก้ไขรายการที่เลือกแล้วลองใหม่",
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

/** Server-side OSM name search for the bulk selector; re-authorized on every call. */
export async function searchPatientOsmBulkCandidatesAction(
  hospitalId: string,
  value: string,
  page = 1,
): Promise<PatientOsmBulkCandidateSearchResult> {
  try {
    const actor = await getProtectedApplicationActor();
    return { status: "OK", ...(await listPatientOsmBulkCandidates(actor, { hospitalId, value, page })) };
  } catch (error: unknown) {
    return {
      status: "ERROR",
      message:
        error instanceof ApplicationError && error.code === "VALIDATION"
          ? "คำค้นหา อสม. ไม่ถูกต้อง กรุณาค้นหาใหม่"
          : "ไม่สามารถค้นหา อสม. ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
    };
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
