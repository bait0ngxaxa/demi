import { PageHeader } from "@/components/ui/page-header";
import type { PersonalMealPage } from "@/modules/meals/domain/personal-meal";
import type { PersonalExercisePage } from "@/modules/exercises/domain/personal-exercise";
import { PersonalMealWorkspace } from "./personal-meal-workspace";
import { PersonalExerciseWorkspace } from "./personal-exercise-workspace";

type Props = { mealPage: PersonalMealPage; exercisePage: PersonalExercisePage; today: string; mealNonce: string; exerciseNonce: string };
export function PersonalWellnessWorkspace({ mealPage, exercisePage, today, mealNonce, exerciseNonce }: Props): React.JSX.Element {
  const linkClassName = "inline-flex min-h-11 items-center rounded-control px-4 font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";
  return <div className="max-w-4xl space-y-8">
    <PageHeader title="สุขภาพ" description="ข้อมูลที่คุณบันทึก" />
    <nav aria-label="หัวข้อสุขภาพ" className="flex flex-wrap gap-2"><a className={linkClassName} href="#meal">อาหาร</a><a className={linkClassName} href="#exercise">การออกกำลังกาย</a></nav>
    <section id="meal" aria-label="อาหาร" className="scroll-mt-24"><PersonalMealWorkspace initialPage={mealPage} today={today} initialNonce={mealNonce} /></section>
    <section id="exercise" aria-label="การออกกำลังกาย" className="scroll-mt-24 border-t border-border pt-8"><PersonalExerciseWorkspace initialPage={exercisePage} today={today} initialNonce={exerciseNonce} /></section>
  </div>;
}
