"use server";

import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ConflictError, ValidationError } from "@/shared/errors/application-error";
import { releaseWorkforceRelationship } from "../services/workforce-service";

export async function releaseWorkforceAction(_state: { message: string; success: boolean }, form: FormData): Promise<{ message: string; success: boolean }> {
  try {
    const actor = await getProtectedApplicationActor();
    await releaseWorkforceRelationship(actor, Object.fromEntries(form.entries()));
    revalidatePath("/app/workforce", "layout");
    revalidatePath("/app/patients", "layout");
    return { success: true, message: "นำออกจากระบบถาวรแล้ว ประวัติยังคงอยู่" };
  } catch (error: unknown) {
    return { success: false, message: error instanceof ConflictError
      ? "ดำเนินการไม่ได้ ข้อมูลเปลี่ยนแปลง หรือเป็นเจ้าของโรงพยาบาลคนสุดท้ายที่ยังใช้งานอยู่ กรุณาโหลดหน้าใหม่"
      : error instanceof ValidationError ? "กรุณาพิมพ์ นำออกจากระบบ เพื่อยืนยัน"
        : "ดำเนินการไม่ได้ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง" };
  }
}
