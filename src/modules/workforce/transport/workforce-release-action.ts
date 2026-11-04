"use server";

import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ConflictError, ForbiddenError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";
import { releaseWorkforceRelationship } from "../services/workforce-service";
import type { WorkforceReleaseActionState } from "./action-state";

export async function releaseWorkforceAction(_state: WorkforceReleaseActionState, form: FormData): Promise<WorkforceReleaseActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await releaseWorkforceRelationship(actor, Object.fromEntries(form.entries()));
    revalidatePath("/app/workforce", "layout");
    revalidatePath("/app/patients", "layout");
    return { success: true, outcome: "RELEASED", message: "สิทธิ์การทำงานกับโรงพยาบาลนี้สิ้นสุดแล้ว ประวัติยังคงอยู่" };
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      return { success: false, outcome: "CONFLICT", message: "ไม่สามารถดำเนินการได้ ข้อมูลอาจเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" };
    }
    if (error instanceof ValidationError) {
      return { success: false, outcome: "INVALID_CONFIRMATION", message: "กรุณาพิมพ์ นำออกจากโรงพยาบาลนี้อย่างถาวร เพื่อยืนยัน" };
    }
    if (error instanceof UnauthenticatedError) {
      return {
        success: false,
        outcome: "FORBIDDEN",
        message: "กรุณาเข้าสู่ระบบอีกครั้งก่อนนำบุคคลนี้ออกจากโรงพยาบาล",
      };
    }
    if (error instanceof ForbiddenError) {
      return {
        success: false,
        outcome: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์นำบุคคลนี้ออกจากโรงพยาบาล",
      };
    }
    return {
      success: false,
      // An unavailable result may follow a committed release, so keep its outcome explicitly unconfirmed.
      outcome: "UNAVAILABLE",
      message: "ยังยืนยันผลการนำบุคคลนี้ออกจากโรงพยาบาลไม่ได้ กรุณาตรวจสอบสถานะก่อนลองใหม่",
    };
  }
}
