"use server";

import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";
import { MealCreateConsumedError } from "../domain/meal-create-consumed-error";
import { createPersonalMeal, updatePersonalMeal, deletePersonalMeal } from "../services/personal-meal-service";
import { listOwnPersonalMeals } from "../services/personal-meal-query-service";
import { mealCreateSchema, mealUpdateSchema, mealDeleteSchema, mealListSchema } from "../schemas/personal-meal-schemas";
import { parseMealForm, type MealOperation } from "./meal-form";
import type { MealActionState } from "./action-state";

async function perform(form: FormData, operation: MealOperation): Promise<MealActionState> {
  try {
    // Bounds before authentication/schema; never dump submitted values into logs.
    const input = parseMealForm(form, operation);
    const actor = await getProtectedApplicationActor();
    const parsed = (operation === "create" ? mealCreateSchema : operation === "update" ? mealUpdateSchema : operation === "delete" ? mealDeleteSchema : mealListSchema).safeParse(input);
    if (!parsed.success) {
      const fieldErrors: MealActionState["fieldErrors"] = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "category") fieldErrors.category = "กรุณาเลือกหมวดมื้ออาหาร";
        if (issue.path[0] === "occurredOn") fieldErrors.occurredOn = "กรุณาระบุวันที่ตามปฏิทินให้ถูกต้อง";
        if (issue.path[0] === "description") fieldErrors.description = "รายละเอียดไม่เกิน 1,000 ตัวอักษรหลังจัดช่องว่าง";
      }
      return { status: "ERROR", message: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors };
    }
    if (operation === "list") return { status: "SUCCESS", page: await listOwnPersonalMeals(actor, input) };
    const result = operation === "create" ? await createPersonalMeal(actor, input) : operation === "update" ? await updatePersonalMeal(actor, input) : await deletePersonalMeal(actor, input);
    revalidatePath("/app/personal/wellness");
    const messages = { CREATED: "บันทึกมื้ออาหารแล้ว", UPDATED: "บันทึกการแก้ไขแล้ว", DELETED: "ลบบันทึกนี้จาก DEMI แล้ว",
      NOOP: "ข้อมูลตรงกับรายการปัจจุบันแล้ว ไม่มีการเปลี่ยนแปลง", REPLAY: "รายการนี้ดำเนินการแล้ว แสดงข้อมูลปัจจุบัน หากต้องการเปลี่ยนข้อมูลให้เลือกแก้ไข หรือเริ่มบันทึกใหม่" };
    return { status: "SUCCESS", result, message: messages[result.outcome] };
  } catch (error: unknown) {
    if (error instanceof MealCreateConsumedError) return { status: "CREATE_CONSUMED", message: "คำขอบันทึกนี้เคยถูกใช้แล้วและไม่สามารถทำซ้ำได้ กรุณาเริ่มบันทึกใหม่" };
    if (error instanceof ApplicationError) {
      if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return { status: "DENIED", message: "บัญชีนี้ไม่สามารถเข้าถึงบันทึกได้" };
      if (error.code === "NOT_FOUND") return { status: "CONFLICT", message: "ไม่พบรายการที่ต้องการ กรุณาโหลดรายการล่าสุด" };
      if (error.code === "CONFLICT") return { status: "CONFLICT", message: "รายการหรือคำขอนี้เปลี่ยนไปแล้ว กรุณาโหลดรายการล่าสุดก่อนดำเนินการต่อ หากกำลังเพิ่มรายการให้ลองคำขอเดิมอีกครั้ง" };
      if (error.code === "VALIDATION") return { status: "ERROR", message: "กรุณาตรวจสอบข้อมูล วันที่ต้องเป็นวันนี้หรือวันที่ผ่านมาแล้ว" };
    }
    return { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้ หากกำลังเพิ่มรายการให้ลองคำขอเดิมอีกครั้งเพื่อตรวจสอบผล" };
  }
}
export async function createPersonalMealAction(_previous: MealActionState, form: FormData): Promise<MealActionState> { return perform(form, "create"); }
export async function updatePersonalMealAction(_previous: MealActionState, form: FormData): Promise<MealActionState> { return perform(form, "update"); }
export async function deletePersonalMealAction(_previous: MealActionState, form: FormData): Promise<MealActionState> { return perform(form, "delete"); }
export async function listPersonalMealsAction(form: FormData): Promise<MealActionState> { return perform(form, "list"); }
