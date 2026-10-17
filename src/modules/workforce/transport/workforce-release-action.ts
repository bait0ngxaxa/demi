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
    return { success: true, outcome: "RELEASED", message: "นำออกจากระบบถาวรแล้ว ประวัติยังคงอยู่" };
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      return { success: false, outcome: "CONFLICT", message: "ดำเนินการไม่ได้ ข้อมูลเปลี่ยนแปลง หรือเป็นเจ้าของโรงพยาบาลคนสุดท้ายที่ยังใช้งานอยู่ กรุณาโหลดหน้าใหม่" };
    }
    if (error instanceof ValidationError) {
      return { success: false, outcome: "INVALID_CONFIRMATION", message: "กรุณาพิมพ์ นำออกจากระบบ เพื่อยืนยัน" };
    }
    return {
      success: false,
      // Only an explicit access refusal is a confirmed FORBIDDEN; anything else may have followed a commit.
      outcome: error instanceof ForbiddenError || error instanceof UnauthenticatedError ? "FORBIDDEN" : "UNAVAILABLE",
      message: "ดำเนินการไม่ได้ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง",
    };
  }
}
