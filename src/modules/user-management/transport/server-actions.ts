"use server";

import { UserTakeoverProviderState } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  correctWorkforcePersonName,
  PatientNameCorrectionRequiresAdminError,
} from "@/modules/patient-hospital-profile/services/patient-name-correction-service";
import type { HospitalPatientEditState } from "@/modules/patient-hospital-profile/transport/hospital-patient-edit-actions";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { deleteUnusedUserRecord, UserRecordNotDeletableError } from "../services/user-record-deletion-service";
import {
  lockSuspectedTakeover,
  UserTakeoverNotEligibleError,
  UserTakeoverRequiresAdminError,
} from "../services/user-takeover-service";
import type { UserRecordDeletionActionState, UserTakeoverActionState } from "./action-state";

function revalidateUserViews(): void {
  revalidatePath("/app/users", "layout");
  revalidatePath("/app/workforce", "layout");
  revalidatePath("/app/patients", "layout");
}

const isRefusal = (error: unknown): boolean => error instanceof ForbiddenError || error instanceof UnauthenticatedError;

/** UM-D2a "ลบรายการ". Only an explicit server outcome is reported as confirmed. */
export async function deleteUserRecordAction(
  _state: UserRecordDeletionActionState,
  form: FormData,
): Promise<UserRecordDeletionActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await deleteUnusedUserRecord(actor, Object.fromEntries(form.entries()));
    revalidateUserViews();
    return { success: true, outcome: "DELETED", blockers: [], message: "ลบรายการแล้ว หากเลขบัตรประชาชนผิด เพิ่มรายการใหม่ด้วยเลขที่ถูกต้องได้ทันที" };
  } catch (error: unknown) {
    if (error instanceof UserRecordNotDeletableError) {
      return { success: false, outcome: "NOT_DELETABLE", blockers: [...error.blockers], message: "ลบรายการนี้ไม่ได้ ใช้ “นำออกจากระบบ” แทน" };
    }
    if (error instanceof ConflictError) {
      return { success: false, outcome: "CONFLICT", blockers: [], message: "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่ก่อนดำเนินการ" };
    }
    if (error instanceof NotFoundError) {
      return { success: false, outcome: "NOT_FOUND", blockers: [], message: "ไม่พบรายการนี้แล้ว อาจถูกลบไปก่อนหน้า" };
    }
    if (error instanceof ValidationError) {
      return { success: false, outcome: "INVALID_CONFIRMATION", blockers: [], message: "กรุณาพิมพ์ ลบรายการ เพื่อยืนยัน" };
    }
    return {
      success: false,
      outcome: isRefusal(error) ? "FORBIDDEN" : "UNAVAILABLE",
      blockers: [],
      message: "ดำเนินการไม่ได้ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง",
    };
  }
}

/** UM-D5 "บัญชีนี้ไม่ใช่เจ้าของจริง". A repeat only retries the provider session revocation. */
export async function lockSuspectedTakeoverAction(
  _state: UserTakeoverActionState,
  form: FormData,
): Promise<UserTakeoverActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const result = await lockSuspectedTakeover(actor, Object.fromEntries(form.entries()));
    revalidateUserViews();
    const confirmed = result.providerState === UserTakeoverProviderState.CONFIRMED;
    return {
      success: true,
      outcome: "LOCKED",
      providerState: result.providerState,
      message: confirmed
        ? "ล็อกบัญชีแล้ว ผู้ที่ใช้บัญชีนี้ถูกตัดออกจากระบบ"
        : "ล็อกบัญชีในระบบแล้ว แต่ยังยืนยันการยกเลิกการเข้าสู่ระบบที่ผู้ให้บริการไม่ได้ กรุณากดซ้ำเพื่อลองอีกครั้ง",
    };
  } catch (error: unknown) {
    const refused = (outcome: UserTakeoverActionState["outcome"], message: string): UserTakeoverActionState =>
      ({ success: false, outcome, providerState: null, message });
    if (error instanceof UserTakeoverRequiresAdminError) {
      return refused("REQUIRES_ADMIN", "บัญชีนี้เชื่อมกับโรงพยาบาลอื่นด้วย กรุณาติดต่อผู้ดูแลระบบ");
    }
    if (error instanceof UserTakeoverNotEligibleError) {
      return refused("NOT_ELIGIBLE", "บัญชีนี้ล็อกไม่ได้ (ยังไม่เปิดใช้งาน นำออกแล้ว หรือเป็นเจ้าของโรงพยาบาล)");
    }
    if (error instanceof ConflictError || error instanceof NotFoundError) {
      return refused("CONFLICT", "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่ก่อนดำเนินการ");
    }
    if (error instanceof ValidationError) {
      return refused("INVALID_CONFIRMATION", "กรุณาพิมพ์ ไม่ใช่เจ้าของจริง เพื่อยืนยัน");
    }
    return refused(isRefusal(error) ? "FORBIDDEN" : "UNAVAILABLE", "ดำเนินการไม่ได้ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง");
  }
}

/** UM-D4: staff/OSM name edit with the E3 rule; same state contract as the Patient name form. */
export async function correctWorkforcePersonNameAction(
  kind: "staff" | "osm",
  relationshipId: string,
  _state: HospitalPatientEditState,
  formData: FormData,
): Promise<HospitalPatientEditState> {
  try {
    const actor = await getProtectedApplicationActor();
    await correctWorkforcePersonName(actor, { kind, relationshipId }, {
      expectedVersion: formData.get("expectedVersion"),
      givenName: formData.get("givenName"),
      familyName: formData.get("familyName"),
    });
    revalidateUserViews();
    return { status: "SUCCESS", message: "แก้ไขชื่อ-สกุลแล้ว" };
  } catch (error: unknown) {
    return error instanceof PatientNameCorrectionRequiresAdminError
      ? { status: "ERROR", code: "FORBIDDEN", message: "บุคคลนี้เชื่อมกับหลายโรงพยาบาล กรุณาติดต่อผู้ดูแลระบบ" }
      : error instanceof ConflictError ? { status: "ERROR", code: "CONFLICT", message: "ชื่อ-สกุลเปลี่ยนแปลงแล้วหรือไม่ได้แก้ไข กรุณาโหลดหน้าใหม่ก่อนบันทึก" }
        : error instanceof ValidationError ? { status: "ERROR", code: "INVALID_INPUT", message: "กรุณากรอกชื่อและนามสกุล (ไม่เกิน 120 ตัวอักษร)" }
          : error instanceof ForbiddenError || error instanceof NotFoundError ? { status: "ERROR", code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์แก้ไขชื่อ-สกุลของรายการนี้" }
            : { status: "ERROR", code: "UNAVAILABLE", message: "บันทึกไม่ได้ กรุณาลองใหม่อีกครั้ง" };
  }
}
