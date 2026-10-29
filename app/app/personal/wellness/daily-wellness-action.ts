"use server";

import type { PersonalMealPage } from "@/modules/meals/domain/personal-meal";
import type { PersonalExercisePage } from "@/modules/exercises/domain/personal-exercise";
import { listPersonalMealsAction } from "@/modules/meals/transport/server-actions";
import { listPersonalExercisesAction } from "@/modules/exercises/transport/server-actions";

export type DailyWellnessRead = { status: "SUCCESS"; mealPage: PersonalMealPage; exercisePage: PersonalExercisePage }
  | { status: "DENIED"; message: string }
  | { status: "ERROR"; message: string };

export async function readDailyWellnessAction(form: FormData): Promise<DailyWellnessRead> {
  // Each domain retains its own bounded parser, authentication and persisted SELF check.
  // No private sibling result is returned when either domain denies access.
  const results = await Promise.allSettled([listPersonalMealsAction(form), listPersonalExercisesAction(form)]);
  if (results.some((result) => result.status === "fulfilled" && result.value.status === "DENIED")) return { status: "DENIED", message: "กรุณาเปิดหน้าสุขภาพใหม่เพื่อยืนยันสิทธิ์" };
  const [mealResult, exerciseResult] = results;
  if (mealResult.status === "rejected" || exerciseResult.status === "rejected") return { status: "ERROR", message: "ยังโหลดข้อมูลรายวันไม่ได้ กรุณาลองอีกครั้ง" };
  const meal = mealResult.value;
  const exercise = exerciseResult.value;
  if (!meal.page || !exercise.page) return { status: "ERROR", message: "ยังโหลดข้อมูลรายวันไม่ได้ กรุณาตรวจสอบวันที่แล้วลองอีกครั้ง" };
  return { status: "SUCCESS", mealPage: meal.page, exercisePage: exercise.page };
}
