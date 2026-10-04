"use server";

import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";
import { ExerciseCreateConsumedError } from "../domain/exercise-create-consumed-error";
import { createPersonalExercise, updatePersonalExercise, deletePersonalExercise } from "../services/personal-exercise-service";
import { listOwnPersonalExercises } from "../services/personal-exercise-query-service";
import { exerciseCreateSchema, exerciseUpdateSchema, exerciseDeleteSchema, exerciseListSchema } from "../schemas/personal-exercise-schemas";
import { parseExerciseForm, type ExerciseOperation } from "./exercise-form";
import type { ExerciseActionState } from "./action-state";

async function perform(form: FormData, operation: ExerciseOperation): Promise<ExerciseActionState> {
  try {
    // Bounds before authentication/schema; never dump submitted values into logs.
    const input = parseExerciseForm(form, operation);
    const actor = await getProtectedApplicationActor();
    const parsed = (operation === "create" ? exerciseCreateSchema : operation === "update" ? exerciseUpdateSchema : operation === "delete" ? exerciseDeleteSchema : exerciseListSchema).safeParse(input);
    if (!parsed.success) {
      const fieldErrors: ExerciseActionState["fieldErrors"] = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "activityName") fieldErrors.activityName = "กรุณาระบุกิจกรรมที่ทำ ไม่เกิน 120 ตัวอักษรหลังตัดช่องว่างหัวท้าย";
        if (issue.path[0] === "occurredOn") fieldErrors.occurredOn = "กรุณาระบุวันที่ตามปฏิทินให้ถูกต้อง";
        if (issue.path[0] === "note") fieldErrors.note = "บันทึกเพิ่มเติมไม่เกิน 1,000 ตัวอักษรหลังตัดช่องว่างหัวท้าย";
        if (issue.path[0] === "durationMinutes") fieldErrors.durationMinutes = "ระยะเวลาต้องเป็นจำนวนเต็ม 1 ถึง 1,000,000 นาที หรือเว้นว่าง";
      }
      return { status: "ERROR", message: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors };
    }
    if (operation === "list") return { status: "SUCCESS", page: await listOwnPersonalExercises(actor, input) };
    const result = operation === "create" ? await createPersonalExercise(actor, input) : operation === "update" ? await updatePersonalExercise(actor, input) : await deletePersonalExercise(actor, input);
    revalidatePath("/app/personal/wellness");
    const messages = { CREATED: "บันทึกการออกกำลังกายแล้ว", UPDATED: "บันทึกการแก้ไขแล้ว", DELETED: "ลบบันทึกนี้จาก DEMI แล้ว",
      NOOP: "ข้อมูลตรงกับรายการปัจจุบันแล้ว ไม่มีการเปลี่ยนแปลง", REPLAY: "รายการนี้ดำเนินการแล้ว แสดงข้อมูลปัจจุบัน หากต้องการเปลี่ยนข้อมูลให้เลือกแก้ไข หรือเริ่มบันทึกใหม่" };
    return { status: "SUCCESS", result, message: messages[result.outcome] };
  } catch (error: unknown) {
    if (error instanceof ExerciseCreateConsumedError) return { status: "CREATE_CONSUMED", message: "คำขอบันทึกนี้เคยถูกใช้แล้วและไม่สามารถทำซ้ำได้ กรุณาเริ่มบันทึกใหม่" };
    if (error instanceof ApplicationError) {
      if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return { status: "DENIED", message: "บัญชีนี้ไม่สามารถเข้าถึงบันทึกได้" };
      if (error.code === "NOT_FOUND") return { status: "CONFLICT", message: "ไม่พบรายการที่ต้องการ กรุณาโหลดรายการล่าสุด" };
      if (error.code === "CONFLICT") return { status: "CONFLICT", message: "รายการหรือคำขอนี้เปลี่ยนไปแล้ว กรุณาโหลดรายการล่าสุดก่อนดำเนินการต่อ หากกำลังเพิ่มรายการให้ลองคำขอเดิมอีกครั้ง" };
      if (error.code === "VALIDATION") return { status: "ERROR", message: "กรุณาตรวจสอบกิจกรรม วันที่ ระยะเวลา และบันทึกเพิ่มเติม วันที่ต้องเป็นวันนี้หรือวันที่ผ่านมาแล้ว" };
    }
    return { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้ หากกำลังเพิ่มรายการให้ลองคำขอเดิมอีกครั้งเพื่อตรวจสอบผล" };
  }
}
export async function createPersonalExerciseAction(_previous: ExerciseActionState, form: FormData): Promise<ExerciseActionState> { return perform(form, "create"); }
export async function updatePersonalExerciseAction(_previous: ExerciseActionState, form: FormData): Promise<ExerciseActionState> { return perform(form, "update"); }
export async function deletePersonalExerciseAction(_previous: ExerciseActionState, form: FormData): Promise<ExerciseActionState> { return perform(form, "delete"); }
export async function listPersonalExercisesAction(form: FormData): Promise<ExerciseActionState> { return perform(form, "list"); }
