"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import { EXERCISE_DURATION_MAX, EXERCISE_ACTIVITY_RAW_MAX, EXERCISE_NOTE_RAW_MAX, type PersonalExerciseDto } from "@/modules/exercises/domain/personal-exercise";
import type { ExerciseActionState } from "@/modules/exercises/transport/action-state";
import { createPersonalExerciseAction, updatePersonalExerciseAction, deletePersonalExerciseAction } from "@/modules/exercises/transport/server-actions";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";

type Coordination = { authority: WellnessPrivateAuthority; isActive: () => boolean; onResult: (state: ExerciseActionState) => void; onPending: (pending: boolean) => void; blocked: boolean };
function useExerciseAction(action: (previous: ExerciseActionState, form: FormData) => Promise<ExerciseActionState>, coordination: Coordination): [ExerciseActionState, (form: FormData) => void, boolean] {
  return useActionState(async (previous: ExerciseActionState, form: FormData) => {
    const authorityGeneration = coordination.authority.captureGeneration();
    if (!coordination.isActive()) return { status: "IDLE" } as const;
    coordination.onPending(true);
    let state: ExerciseActionState;
    try { state = await action(previous, form); }
    catch { state = { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้ กรุณาลองคำขอเดิมอีกครั้ง" }; }
    if (!coordination.isActive() || !coordination.authority.isCurrent(authorityGeneration)) return { status: "IDLE" } as const;
    coordination.onPending(false);
    coordination.onResult(state);
    return coordination.isActive() && coordination.authority.isCurrent(authorityGeneration) ? state : { status: "IDLE" } as const;
  }, { status: "IDLE" });
}
export function ExerciseEditor({ item, today, nonce, coordination }: { item?: PersonalExerciseDto; today: string; nonce: string; coordination: Coordination }): React.JSX.Element {
  const [state, action, pending] = useExerciseAction(item ? updatePersonalExerciseAction : createPersonalExerciseAction, coordination);
  const [activityName, setActivityName] = useState(item?.activityName ?? "");
  const [durationMinutes, setDurationMinutes] = useState(item?.durationMinutes?.toString() ?? "");
  const [occurredOn, setOccurredOn] = useState(item?.occurredOn ?? today);
  const [note, setNote] = useState(item?.note ?? "");
  const prefix = useId();
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  // Retryable create conflicts/ambiguity keep the SAME nonce. Consumed creates require explicit new intent.
  const blocked = coordination.blocked || pending || state.status === "SUCCESS" || state.status === "DENIED" || state.status === "CREATE_CONSUMED" || Boolean(item && (state.status === "CONFLICT" || state.status === "UNCONFIRMED"));
  return <form action={action} className="space-y-4">
    {item ? <><input type="hidden" name="entryId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={item.updatedAt} /></> : <input type="hidden" name="submissionNonce" value={nonce} />}
    <fieldset disabled={blocked} className="space-y-4">
      <div className="space-y-2"><label htmlFor={`${prefix}-activity`} className="block text-sm font-medium">กิจกรรมที่ทำ</label>
        <Input id={`${prefix}-activity`} name="activityName" required maxLength={EXERCISE_ACTIVITY_RAW_MAX} value={activityName} onChange={(e) => setActivityName(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.activityName)} aria-describedby={`${prefix}-activity-help`} />
        <p id={`${prefix}-activity-help`} className="text-sm text-text-muted">{state.fieldErrors?.activityName ?? "ไม่เกิน 120 ตัวอักษรหลังตัดช่องว่างหัวท้าย"}</p></div>
      <div className="space-y-2"><label htmlFor={`${prefix}-date`} className="block text-sm font-medium">วันที่ออกกำลังกาย</label>
        <Input id={`${prefix}-date`} type="date" name="occurredOn" required min="0001-01-01" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.occurredOn)} aria-describedby={`${prefix}-date-help`} />
        <p id={`${prefix}-date-help`} className="text-sm text-text-muted">{state.fieldErrors?.occurredOn ?? "วันนี้หรือวันที่ผ่านมาแล้ว ตามเวลาไทย (Asia/Bangkok)"}</p></div>
      <div className="space-y-2"><label htmlFor={`${prefix}-duration`} className="block text-sm font-medium">ระยะเวลา (นาที, ไม่บังคับ)</label>
        <Input id={`${prefix}-duration`} name="durationMinutes" type="number" inputMode="numeric" min={1} max={EXERCISE_DURATION_MAX} step={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.durationMinutes)} aria-describedby={`${prefix}-duration-help`} />
        <p id={`${prefix}-duration-help`} className="text-sm text-text-muted">{state.fieldErrors?.durationMinutes ?? "เว้นว่างได้ หากระบุให้ใช้จำนวนเต็มนาที"}</p></div>
      <div className="space-y-2"><label htmlFor={`${prefix}-note`} className="block text-sm font-medium">บันทึกเพิ่มเติม (ไม่บังคับ)</label>
        <textarea id={`${prefix}-note`} className={`${inputClassName} py-3`} name="note" rows={4} maxLength={EXERCISE_NOTE_RAW_MAX} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.note)} aria-describedby={`${prefix}-note-help`} />
        <p id={`${prefix}-note-help`} className="text-sm text-text-muted">{state.fieldErrors?.note ?? "ไม่เกิน 1,000 ตัวอักษรหลังตัดช่องว่างหัวท้าย"}</p></div>
    </fieldset>
    <div ref={feedback} tabIndex={-1} role="status">{state.message ? <Alert variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert> : null}</div>
    <Button type="submit" loading={pending} disabled={blocked}>{pending ? "กำลังบันทึก..." : !item && (state.status === "UNCONFIRMED" || state.status === "CONFLICT") ? "ลองคำขอเดิมอีกครั้ง" : item ? "บันทึกการแก้ไข" : "บันทึกการออกกำลังกาย"}</Button>
  </form>;
}
export function ExerciseDeleteForm({ item, coordination }: { item: PersonalExerciseDto; coordination: Coordination }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useExerciseAction(deletePersonalExerciseAction, coordination);
  const opener = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirming) confirm.current?.focus(); }, [confirming]);
  const blocked = coordination.blocked || pending || state.status !== "IDLE";
  return <div className="space-y-3 border-t border-border pt-4">
    <Button ref={opener} variant="danger" disabled={blocked} onClick={() => setConfirming(true)}>ลบบันทึกนี้</Button>
    {confirming ? <form action={action} className="space-y-3" aria-label="ยืนยันลบบันทึก">
      <p>ลบบันทึกการออกกำลังกายนี้ออกจากรายการปัจจุบันใน DEMI?</p>
      <input type="hidden" name="entryId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={item.updatedAt} />
      <div className="flex flex-wrap gap-2"><Button ref={confirm} type="submit" variant="danger" loading={pending} disabled={blocked}>{pending ? "กำลังลบ..." : "ยืนยันลบ"}</Button>
        <Button variant="secondary" disabled={pending} onClick={() => { setConfirming(false); opener.current?.focus(); }}>ยกเลิก</Button></div>
    </form> : null}
    {state.message ? <div role="status"><Alert variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert></div> : null}
  </div>;
}
