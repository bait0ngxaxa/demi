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

/** UM-D2a. Only an explicit server outcome is reported as confirmed. */
export async function deleteUserRecordAction(
  _state: UserRecordDeletionActionState,
  form: FormData,
): Promise<UserRecordDeletionActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await deleteUnusedUserRecord(actor, Object.fromEntries(form.entries()));
    revalidateUserViews();
    return { success: true, outcome: "DELETED", blockers: [], message: "ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งานแล้ว หากเลขบัตรประชาชนผิด เพิ่มข้อมูลใหม่ด้วยเลขที่ถูกต้องได้" };
  } catch (error: unknown) {
    if (error instanceof UserRecordNotDeletableError) {
      return { success: false, outcome: "NOT_DELETABLE", blockers: [...error.blockers], message: "ลบข้อมูลผู้ใช้นี้ไม่ได้ โปรดดูเหตุผลด้านบน" };
    }
    if (error instanceof ConflictError) {
      return { success: false, outcome: "CONFLICT", blockers: [], message: "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่ก่อนลบ" };
    }
    if (error instanceof NotFoundError) {
      return { success: false, outcome: "NOT_FOUND", blockers: [], message: "ไม่พบข้อมูลผู้ใช้นี้แล้ว อาจถูกลบไปก่อนหน้า" };
    }
    if (error instanceof ValidationError) {
      return { success: false, outcome: "INVALID_CONFIRMATION", blockers: [], message: "กรุณาพิมพ์ ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งาน เพื่อยืนยัน" };
    }
    return {
      success: false,
      outcome: isRefusal(error) ? "FORBIDDEN" : "UNAVAILABLE",
      blockers: [],
      message: "ลบข้อมูลผู้ใช้ไม่ได้ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง",
    };
  }
}

/** UM-D5 suspected account misuse. A repeat only retries provider-session revocation. */
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
        ? "ล็อกบัญชีใน DEMI แล้ว ผู้ให้บริการยืนยันการระงับการเข้าสู่ระบบใหม่และการต่ออายุเซสชันเดิมแล้ว อุปกรณ์ที่มีเซสชันเดิมอาจยังแสดงว่าล็อกอินอยู่ แต่ระบบ DEMI จะปฏิเสธการใช้งานของบัญชีนี้"
        : "ล็อกบัญชีใน DEMI แล้ว แต่ยังยืนยันไม่ได้ว่าผู้ให้บริการระงับการเข้าสู่ระบบใหม่และการต่ออายุเซสชันเดิมแล้ว บัญชีนี้ยังเข้าใช้ DEMI ไม่ได้ กดซ้ำเพื่อลองยืนยันกับผู้ให้บริการอีกครั้ง",
    };
  } catch (error: unknown) {
    const refused = (outcome: UserTakeoverActionState["outcome"], message: string): UserTakeoverActionState =>
      ({ success: false, outcome, providerState: null, message });
    if (error instanceof UserTakeoverRequiresAdminError) {
      return refused("REQUIRES_ADMIN", "กรณีนี้ต้องให้ผู้ดูแลระบบ DEMI ตรวจสอบก่อน");
    }
    if (error instanceof UserTakeoverNotEligibleError) {
      return refused("NOT_ELIGIBLE", "ไม่สามารถล็อกบัญชีนี้ได้ตามเงื่อนไขที่กำหนด");
    }
    if (error instanceof ConflictError || error instanceof NotFoundError) {
      return refused("CONFLICT", "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่ก่อนดำเนินการ");
    }
    if (error instanceof ValidationError) {
      return refused("INVALID_CONFIRMATION", "กรุณาพิมพ์ สงสัยว่ามีผู้อื่นใช้บัญชีนี้ เพื่อยืนยัน");
    }
    return refused(isRefusal(error) ? "FORBIDDEN" : "UNAVAILABLE", "แจ้งสงสัยว่ามีผู้อื่นใช้บัญชีนี้ไม่ได้ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง");
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
      ? { status: "ERROR", code: "FORBIDDEN", message: "แก้ไขชื่อจากหน้านี้ไม่ได้ กรุณาติดต่อผู้ดูแลระบบ DEMI" }
      : error instanceof ConflictError ? { status: "ERROR", code: "CONFLICT", message: "ชื่อ-สกุลเปลี่ยนแปลงแล้วหรือไม่ได้แก้ไข กรุณาโหลดหน้าใหม่ก่อนบันทึก" }
        : error instanceof ValidationError ? { status: "ERROR", code: "INVALID_INPUT", message: "กรุณากรอกชื่อและนามสกุล (ไม่เกิน 120 ตัวอักษร)" }
          : error instanceof ForbiddenError || error instanceof NotFoundError ? { status: "ERROR", code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์แก้ไขชื่อ-สกุลของรายการนี้" }
            : { status: "ERROR", code: "UNAVAILABLE", message: "บันทึกไม่ได้ กรุณาลองใหม่อีกครั้ง" };
  }
}
