"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { readDailyWellnessAction } from "./daily-wellness-action";
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
  const [date, setDate] = useState(today);
  const [dateDraft, setDateDraft] = useState(today);
  const [mealSummary, setMealSummary] = useState(mealPage.dailySummary);
  const [exerciseSummary, setExerciseSummary] = useState(exercisePage.dailySummary);
  const [dateError, setDateError] = useState("");
  const [pending, startTransition] = useTransition();
  const locks = useRef({ meal: false, exercise: false, weight: false });
  const request = useRef(0);
  function changeDate(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!session || pending || !authority.isActive()) return;
    if (Object.values(locks.current).some(Boolean)) { setDateError("กรุณารอการบันทึกหรือทบทวนผลคำขอเดิมก่อนเปลี่ยนวัน"); return; }
    const captured = ++request.current;
    const generation = authority.captureGeneration();
    startTransition(async () => {
      const form = new FormData();
      form.set("occurredOn", dateDraft);
      try {
        const result = await readDailyWellnessAction(form);
        if (captured !== request.current || !authority.isCurrent(generation)) return;
        if (result.status === "DENIED") { authority.invalidate(); return; }
        if (result.status === "ERROR") { setDateError(result.message); return; }
        setSession({ ...session, mealPage: result.mealPage, exercisePage: result.exercisePage, mealNonce: crypto.randomUUID(), exerciseNonce: crypto.randomUUID() });
        setMealSummary(result.mealPage.dailySummary);
        setExerciseSummary(result.exercisePage.dailySummary);
        setDate(dateDraft);
        setDateError("");
      } catch {
        if (captured === request.current && authority.isCurrent(generation)) setDateError("ยังโหลดข้อมูลรายวันไม่ได้ กรุณาลองอีกครั้ง");
      }
    });
  }
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
    <PageHeader breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "สุขภาพ" }]} title="สุขภาพ" description="ข้อมูลที่คุณบันทึก" />
    <Alert variant="warning">กรุณาเปิดหน้าสุขภาพใหม่เพื่อยืนยันสิทธิ์ <a className="underline" href="/app/personal/wellness">เปิดหน้าสุขภาพ</a></Alert>
  </div>;

  const linkClassName = "inline-flex min-h-12 items-center justify-center rounded-control border border-border bg-surface px-4 text-sm font-semibold text-brand-strong hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";
  return <div className="min-w-0 max-w-4xl space-y-6">
    <PageHeader breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "สุขภาพ" }]} title="สุขภาพ" description="ข้อมูลที่คุณบันทึก" />
    <nav aria-label="หัวข้อสุขภาพ" className="grid grid-cols-2 gap-2 sm:grid-cols-3"><a className={linkClassName} href="#meal">บันทึกอาหาร</a><a className={linkClassName} href="#exercise">บันทึกกิจกรรม</a><a className={`${linkClassName} col-span-2 sm:col-span-1`} href="#weight-goal">เป้าหมายน้ำหนัก</a></nav>
    <Panel aria-label="ภาพรวมรายวัน">
      <div className="space-y-5">
        <form onSubmit={changeDate} className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2"><label htmlFor="wellness-date" className="block text-sm font-medium">วันที่บันทึก (เวลาไทย)</label><Input id="wellness-date" type="date" min="0001-01-01" required value={dateDraft} disabled={pending} aria-describedby="wellness-date-help" onChange={(event) => setDateDraft(event.target.value)} /></div>
          <Button type="submit" loading={pending}>ดูบันทึกตามวันที่</Button>
        </form>
        <p id="wellness-date-help" className="text-sm text-text-muted">เลือกวันเพื่อดูประวัติหรือบันทึกย้อนหลัง การเปิดวันใหม่จะเริ่มแบบฟอร์มอาหารและกิจกรรมใหม่</p>
        {dateError ? <Alert variant="warning">{dateError}</Alert> : null}
        <div aria-live="polite" aria-busy={pending} className="space-y-3">
          <h2 className="text-xl font-semibold">ภาพรวมวันที่ <time dateTime={date}>{date}</time></h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-control bg-surface-muted p-4"><dt className="text-sm text-text-muted">มื้ออาหารที่บันทึก</dt><dd className="mt-1 font-semibold">{mealSummary ? mealSummary.count ? `${mealSummary.count.toLocaleString("th-TH")} รายการ` : "ยังไม่มีบันทึกมื้ออาหาร" : "ข้อมูลสรุปล่าสุดยังไม่พร้อม กรุณาโหลดรายการล่าสุดในหัวข้อนี้"}</dd></div>
            <div className="rounded-control bg-surface-muted p-4"><dt className="text-sm text-text-muted">กิจกรรมที่บันทึก</dt><dd className="mt-1 font-semibold">{exerciseSummary ? exerciseSummary.count ? `${exerciseSummary.count.toLocaleString("th-TH")} รายการ` : "ยังไม่มีบันทึกการออกกำลังกาย" : "ข้อมูลสรุปล่าสุดยังไม่พร้อม กรุณาโหลดรายการล่าสุดในหัวข้อนี้"}</dd>
              {exerciseSummary && exerciseSummary.count > 0 ? <dd className="mt-1 text-sm text-text-muted">{exerciseSummary.durationMinutes === null ? "ไม่ได้บันทึกระยะเวลา" : `รวมเฉพาะเวลาที่ระบุ ${exerciseSummary.durationMinutes.toLocaleString("th-TH")} นาที`}{exerciseSummary.recordedDurationCount < exerciseSummary.count && exerciseSummary.recordedDurationCount > 0 ? ` · ไม่ระบุเวลา ${exerciseSummary.count - exerciseSummary.recordedDurationCount} รายการ` : ""}</dd> : null}
            </div>
          </dl>
        </div>
      </div>
    </Panel>
    <fieldset disabled={pending} className="min-w-0 space-y-8">
      <legend className="sr-only">บันทึกสุขภาพส่วนตัว</legend>
      <section id="meal" aria-label="อาหาร" className="scroll-mt-24"><PersonalMealWorkspace key={`meal:${date}:${session.mealNonce}`} initialPage={session.mealPage} today={date} initialNonce={session.mealNonce} authority={authority} date={date} onSummary={setMealSummary} onLockChange={(value) => { locks.current.meal = value; }} /></section>
      <section id="exercise" aria-label="การออกกำลังกาย" className="scroll-mt-24 border-t border-border pt-8"><PersonalExerciseWorkspace key={`exercise:${date}:${session.exerciseNonce}`} initialPage={session.exercisePage} today={date} initialNonce={session.exerciseNonce} authority={authority} date={date} onSummary={setExerciseSummary} onLockChange={(value) => { locks.current.exercise = value; }} /></section>
      <section id="weight-goal" aria-label="เป้าหมายน้ำหนัก" className="scroll-mt-24 border-t border-border pt-8"><PersonalWeightGoalWorkspace initialGoal={session.weightGoal} initialNonce={session.weightGoalNonce} authority={authority} onLockChange={(value) => { locks.current.weight = value; }} /></section>
    </fieldset>
    <div className="space-y-2 border-t border-border pt-5">
      <p className="text-sm leading-6 text-text-muted">บันทึกน้ำหนัก ความดัน และน้ำตาลที่คุณวัดเองได้ที่ <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href="/app/personal/measurements">ตัวฉันในตอนนี้</Link></p>
      <p className="text-sm leading-6 text-text-muted">บันทึกสุขภาพเป็นข้อมูลที่คุณบันทึกเอง ไม่ใช่คำแนะนำทางการแพทย์จาก DEMI</p>
    </div>
  </div>;
}
