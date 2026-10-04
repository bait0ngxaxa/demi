"use server";

import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";
import { getOwnPersonalWeightGoal } from "../services/personal-weight-goal-query-service";
import { createPersonalWeightGoal, removePersonalWeightGoal, updatePersonalWeightGoal } from "../services/personal-weight-goal-service";
import {
  personalWeightGoalCreateSchema,
  personalWeightGoalReadSchema,
  personalWeightGoalRemoveSchema,
  personalWeightGoalUpdateSchema,
} from "../schemas/personal-weight-goal-schemas";
import { parseWeightGoalForm, type WeightGoalOperation } from "./weight-goal-form";
import type { PersonalWeightGoalActionState } from "./action-state";

function fieldErrorsFor(input: unknown, operation: WeightGoalOperation): PersonalWeightGoalActionState["fieldErrors"] {
  const parsed = (operation === "create" ? personalWeightGoalCreateSchema
    : operation === "update" ? personalWeightGoalUpdateSchema
      : operation === "remove" ? personalWeightGoalRemoveSchema
        : personalWeightGoalReadSchema).safeParse(input);
  if (parsed.success) return undefined;
  const fieldErrors: NonNullable<PersonalWeightGoalActionState["fieldErrors"]> = {};
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === "targetWeightKg") fieldErrors.targetWeightKg = "กรุณาระบุน้ำหนักเป็นกิโลกรัม ทศนิยมไม่เกิน 3 ตำแหน่ง";
    if (issue.path[0] === "targetDate") fieldErrors.targetDate = "กรุณาระบุวันที่ตามปฏิทินให้ถูกต้อง";
  }
  return fieldErrors;
}

async function perform(formData: FormData, operation: WeightGoalOperation): Promise<PersonalWeightGoalActionState> {
  try {
    const input = parseWeightGoalForm(formData, operation);
    const actor = await getProtectedApplicationActor();
    const parsed = (operation === "create" ? personalWeightGoalCreateSchema
      : operation === "update" ? personalWeightGoalUpdateSchema
        : operation === "remove" ? personalWeightGoalRemoveSchema
          : personalWeightGoalReadSchema).safeParse(input);
    if (!parsed.success) return { status: "ERROR", message: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: fieldErrorsFor(input, operation) };

    if (operation === "read") return { status: "SUCCESS", currentGoal: await getOwnPersonalWeightGoal(actor) };
    const result = operation === "create"
      ? await createPersonalWeightGoal(actor, input)
      : operation === "update"
        ? await updatePersonalWeightGoal(actor, input)
        : await removePersonalWeightGoal(actor, input);

    if (result.outcome === "CREATE_CONSUMED") {
      return { status: "CREATE_CONSUMED", message: "คำขอตั้งเป้าหมายนี้ถูกดำเนินการแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนดำเนินการต่อ" };
    }
    if (result.outcome === "UNCONFIRMED") {
      return { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้ กรุณาลองคำขอเดิมอีกครั้ง" };
    }

    if (result.outcome === "CREATED" || result.outcome === "UPDATED" || result.outcome === "DELETED") {
      revalidatePath("/app/personal/wellness");
    }
    const messages = {
      CREATED: "บันทึกเป้าหมายน้ำหนักแล้ว",
      REPLAY: "แสดงเป้าหมายปัจจุบันที่บันทึกไว้แล้ว",
      UPDATED: "บันทึกการแก้ไขแล้ว",
      NOOP: "ข้อมูลตรงกับเป้าหมายปัจจุบันแล้ว ไม่มีการเปลี่ยนแปลง",
      DELETED: "ลบเป้าหมายน้ำหนักปัจจุบันแล้ว",
    };
    return { status: "SUCCESS", result, message: messages[result.outcome] };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
        return { status: "DENIED", message: "บัญชีนี้ไม่สามารถเข้าถึงเป้าหมายน้ำหนักได้" };
      }
      if (error.code === "NOT_FOUND" || error.code === "CONFLICT") {
        return { status: "CONFLICT", message: "เป้าหมายเปลี่ยนไปแล้วหรือไม่พบข้อมูล กรุณาโหลดข้อมูลล่าสุด" };
      }
      if (error.code === "VALIDATION") {
        return {
          status: "ERROR",
          message: "วันที่เป้าหมายใหม่ต้องเป็นวันนี้หรือวันข้างหน้า ตรวจสอบข้อมูลที่กรอกอีกครั้ง",
          fieldErrors: operation === "create" || operation === "update"
            ? { targetDate: "วันที่ใหม่ต้องเป็นวันนี้หรือวันข้างหน้า" }
            : undefined,
        };
      }
    }
    return { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้ กรุณาลองคำขอเดิมอีกครั้ง" };
  }
}

export async function readPersonalWeightGoalAction(formData: FormData): Promise<PersonalWeightGoalActionState> {
  return perform(formData, "read");
}

export async function createPersonalWeightGoalAction(_previous: PersonalWeightGoalActionState, formData: FormData): Promise<PersonalWeightGoalActionState> {
  return perform(formData, "create");
}

export async function updatePersonalWeightGoalAction(_previous: PersonalWeightGoalActionState, formData: FormData): Promise<PersonalWeightGoalActionState> {
  return perform(formData, "update");
}

export async function removePersonalWeightGoalAction(_previous: PersonalWeightGoalActionState, formData: FormData): Promise<PersonalWeightGoalActionState> {
  return perform(formData, "remove");
}
