"use client";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import type { PersonalMealPage } from "@/modules/meals/domain/personal-meal";
import type { PersonalExercisePage } from "@/modules/exercises/domain/personal-exercise";
import type { PersonalWeightGoalDto } from "@/modules/weight-goals/domain/personal-weight-goal";
import { PersonalMealWorkspace } from "./personal-meal-workspace";
import { PersonalExerciseWorkspace } from "./personal-exercise-workspace";
import { PersonalWeightGoalWorkspace } from "./personal-weight-goal-workspace";
import { createWellnessPrivateAuthority } from "./wellness-private-authority";

type Props = { mealPage: PersonalMealPage; exercisePage: PersonalExercisePage; weightGoal: PersonalWeightGoalDto | null; today: string; mealNonce: string; exerciseNonce: string; weightGoalNonce: string };
type Session = Pick<Props, "mealPage" | "exercisePage" | "weightGoal" | "mealNonce" | "exerciseNonce" | "weightGoalNonce">;
export function PersonalWellnessWorkspace({ mealPage, exercisePage, weightGoal, today, mealNonce, exerciseNonce, weightGoalNonce }: Props): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(() => ({ mealPage, exercisePage, weightGoal, mealNonce, exerciseNonce, weightGoalNonce }));
  const [authority] = useState(() => createWellnessPrivateAuthority(() => setSession(null)));
  useEffect(() => {
    authority.resume();
    const clear = (): void => authority.invalidate();
    const restore = (event: PageTransitionEvent): void => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", restore);
    return () => {
      authority.suspend();
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", restore);
    };
  }, [authority]);

  if (session === null) return <div className="max-w-4xl space-y-6">
    <PageHeader title="สุขภาพ" description="ข้อมูลที่คุณบันทึก" />
    <Alert variant="warning">กรุณาเปิดหน้าสุขภาพใหม่เพื่อยืนยันสิทธิ์ <a className="underline" href="/app/personal/wellness">เปิดหน้าสุขภาพ</a></Alert>
  </div>;

  const linkClassName = "inline-flex min-h-11 items-center rounded-control px-4 font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";
  return <div className="max-w-4xl space-y-8">
    <PageHeader title="สุขภาพ" description="ข้อมูลที่คุณบันทึก" />
    <nav aria-label="หัวข้อสุขภาพ" className="flex flex-wrap gap-2"><a className={linkClassName} href="#meal">อาหาร</a><a className={linkClassName} href="#exercise">การออกกำลังกาย</a><a className={linkClassName} href="#weight-goal">เป้าหมายน้ำหนัก</a></nav>
    <section id="meal" aria-label="อาหาร" className="scroll-mt-24"><PersonalMealWorkspace initialPage={session.mealPage} today={today} initialNonce={session.mealNonce} authority={authority} /></section>
    <section id="exercise" aria-label="การออกกำลังกาย" className="scroll-mt-24 border-t border-border pt-8"><PersonalExerciseWorkspace initialPage={session.exercisePage} today={today} initialNonce={session.exerciseNonce} authority={authority} /></section>
    <section id="weight-goal" aria-label="เป้าหมายน้ำหนัก" className="scroll-mt-24 border-t border-border pt-8"><PersonalWeightGoalWorkspace initialGoal={session.weightGoal} initialNonce={session.weightGoalNonce} authority={authority} /></section>
  </div>;
}
