"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import { PatientSelfSessionExpiredAlert } from "../patient-self-session-expired-alert";
import { EXERCISE_DURATION_MAX, EXERCISE_ACTIVITY_RAW_MAX, EXERCISE_NOTE_RAW_MAX, type PersonalExerciseDto } from "@/modules/exercises/domain/personal-exercise";
import type { ExerciseActionState } from "@/modules/exercises/transport/action-state";
import { createPersonalExerciseAction, updatePersonalExerciseAction, deletePersonalExerciseAction } from "@/modules/exercises/transport/server-actions";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";

type Coordination = { authority: WellnessPrivateAuthority; isActive: () => boolean; onResult: (state: ExerciseActionState) => void; onPending: (pending: boolean) => void; blocked: boolean };
const activityOptions = ["เดิน", "วิ่ง", "ปั่นจักรยาน", "แบดมินตัน", "ฟุตบอล"];
function useExerciseAction(action: (previous: ExerciseActionState, form: FormData) => Promise<ExerciseActionState>, coordination: Coordination, create = false): [ExerciseActionState, (form: FormData) => void, boolean, boolean] {
  const payload = useRef<FormData | null>(null);
  const [recovery, setRecovery] = useState<"EDITABLE" | "RETRY_ORIGINAL">("EDITABLE");
  const recovering = recovery === "RETRY_ORIGINAL";
  const [state, dispatch, pending] = useActionState(async (previous: ExerciseActionState, form: FormData) => {
    const authorityGeneration = coordination.authority.captureGeneration();
    if (!coordination.isActive()) return { status: "IDLE" } as const;
    coordination.onPending(true);
    let state: ExerciseActionState;
    const submitted = payload.current ?? form;
    const snapshot = new FormData();
    for (const [key, value] of submitted) snapshot.append(key, value);
    try { state = await action(previous, snapshot); }
    catch { state = { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้ กรุณาลองคำขอเดิมอีกครั้ง" }; }
    if (!coordination.isActive() || !coordination.authority.isCurrent(authorityGeneration)) return { status: "IDLE" } as const;
    if (create) {
      // A read or failed retry cannot prove that the original write rolled back.
      const unresolved = !state.result && state.status !== "CREATE_CONSUMED" && (payload.current !== null || state.status === "UNCONFIRMED" || state.status === "CONFLICT");
      payload.current = unresolved ? submitted : null;
      setRecovery(unresolved ? "RETRY_ORIGINAL" : "EDITABLE");
    }
    coordination.onPending(false);
    coordination.onResult(state);
    return coordination.isActive() && coordination.authority.isCurrent(authorityGeneration) ? state : { status: "IDLE" } as const;
  }, { status: "IDLE" });
  return [state, dispatch, pending, recovering];
}
export function ExerciseEditor({ item, today, maxDate, nonce, coordination }: { item?: PersonalExerciseDto; today: string; maxDate?: string; nonce: string; coordination: Coordination }): React.JSX.Element {
  const [state, action, pending, recovering] = useExerciseAction(item ? updatePersonalExerciseAction : createPersonalExerciseAction, coordination, !item);
  const [activityName, setActivityName] = useState(item?.activityName ?? "");
  const [durationMinutes, setDurationMinutes] = useState(item?.durationMinutes?.toString() ?? "");
  const [occurredOn, setOccurredOn] = useState(item?.occurredOn ?? today);
  const [note, setNote] = useState(item?.note ?? "");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(Boolean(item));
  const prefix = useId();
  const feedback = useRef<HTMLDivElement>(null);
  const returnToSearch = useRef(false);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  useEffect(() => {
    if (editorOpen) document.getElementById(`${prefix}-activity`)?.focus();
    else if (returnToSearch.current) { document.getElementById(`${prefix}-search`)?.focus(); returnToSearch.current = false; }
  }, [editorOpen, prefix]);
  function chooseActivity(name: string): void { setActivityName(name); setEditorOpen(true); }
  // Retryable create conflicts/ambiguity keep the SAME nonce. Consumed creates require explicit new intent.
  const blocked = coordination.blocked || pending || state.status === "SUCCESS" || state.status === "DENIED" || state.status === "CREATE_CONSUMED" || Boolean(item && (state.status === "CONFLICT" || state.status === "UNCONFIRMED"));
  return <div className="space-y-4">
    <fieldset hidden={editorOpen} disabled={blocked || recovering} className="space-y-4">
      <div className="space-y-4">
        <label htmlFor={`${prefix}-search`} className="sr-only">ค้นหาและเลือกการออกกำลังกาย</label>
        <Input id={`${prefix}-search`} type="search" maxLength={120} placeholder="ค้นหากิจกรรม" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="grid max-h-80 gap-3 overflow-y-auto overscroll-contain p-2 sm:grid-cols-2" role="group" aria-label="กิจกรรมที่เลือกได้">
          {activityOptions.filter((name) => name.includes(search.trim())).map((name) => <Button key={name} variant="secondary" className="min-h-16 w-full justify-between gap-4 text-left" aria-controls={`${prefix}-entry`} onClick={() => chooseActivity(name)}><span className="flex w-full items-center justify-between gap-4 text-left"><span className="text-base">{name}</span><svg aria-hidden="true" className="h-5 w-5 shrink-0 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg></span></Button>)}
          <Button variant="secondary" className="min-h-16 w-full justify-start text-base" aria-controls={`${prefix}-entry`} onClick={() => chooseActivity("")}><span className="w-full text-left">อื่น ๆ / กรอกเอง</span></Button>
        </div>
        {search.trim() && !activityOptions.some((name) => name.includes(search.trim())) ? <p role="status" className="text-sm text-text-muted">ไม่พบกิจกรรม สามารถกรอกชื่อกิจกรรมของคุณได้</p> : null}
      </div>
    </fieldset>
    <form action={action} hidden={!editorOpen} onSubmit={(event) => { if (!editorOpen) event.preventDefault(); }} className="space-y-4">
    {item ? <><input type="hidden" name="entryId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={item.updatedAt} /></> : <input type="hidden" name="submissionNonce" value={nonce} />}
    <fieldset disabled={blocked || recovering} className="space-y-4">
      <div id={`${prefix}-entry`} className="space-y-4">
      <Button variant="ghost" onClick={() => { returnToSearch.current = true; setEditorOpen(false); setSearch(""); }}>เปลี่ยนกิจกรรม</Button>
      <div className="space-y-2"><label htmlFor={`${prefix}-activity`} className="block text-sm font-medium">กิจกรรมที่ทำ</label>
        <Input id={`${prefix}-activity`} name="activityName" required maxLength={EXERCISE_ACTIVITY_RAW_MAX} value={activityName} onChange={(e) => setActivityName(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.activityName)} aria-describedby={`${prefix}-activity-help`} />
        <p id={`${prefix}-activity-help`} className="text-sm text-text-muted">{state.fieldErrors?.activityName ?? "ไม่เกิน 120 ตัวอักษรหลังตัดช่องว่างหัวท้าย"}</p></div>
      <div className="space-y-2"><label htmlFor={`${prefix}-date`} className="block text-sm font-medium">วันที่ออกกำลังกาย</label>
        <Input id={`${prefix}-date`} type="date" name="occurredOn" required min="0001-01-01" max={maxDate} value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.occurredOn)} aria-describedby={`${prefix}-date-help`} />
        <p id={`${prefix}-date-help`} className="text-sm text-text-muted">{state.fieldErrors?.occurredOn ?? "วันนี้หรือวันที่ผ่านมาแล้ว ตามเวลาไทย (Asia/Bangkok)"}</p></div>
      <div className="space-y-2"><label htmlFor={`${prefix}-duration`} className="block text-sm font-medium">ระยะเวลา (นาที, ไม่บังคับ)</label>
        <Input id={`${prefix}-duration`} name="durationMinutes" type="number" inputMode="numeric" min={1} max={EXERCISE_DURATION_MAX} step={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.durationMinutes)} aria-describedby={`${prefix}-duration-help`} />
        <p id={`${prefix}-duration-help`} className="text-sm text-text-muted">{state.fieldErrors?.durationMinutes ?? "เว้นว่างได้ หากระบุให้ใช้จำนวนเต็มนาที"}</p></div>
      <div className="space-y-2"><label htmlFor={`${prefix}-note`} className="block text-sm font-medium">บันทึกเพิ่มเติม (ไม่บังคับ)</label>
        <textarea id={`${prefix}-note`} className={`${inputClassName} py-3`} name="note" rows={4} maxLength={EXERCISE_NOTE_RAW_MAX} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.note)} aria-describedby={`${prefix}-note-help`} />
        <p id={`${prefix}-note-help`} className="text-sm text-text-muted">{state.fieldErrors?.note ?? "ไม่เกิน 1,000 ตัวอักษรหลังตัดช่องว่างหัวท้าย"}</p></div>
      </div>
    </fieldset>
    <div ref={feedback} tabIndex={-1} role="status">{state.message ? state.loginHref ? <PatientSelfSessionExpiredAlert href={state.loginHref} message={state.message} /> : <Alert data-navigation-guard={state.status === "UNCONFIRMED" ? "unknown-outcome" : undefined} variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert> : null}</div>
    {recovering ? <p data-navigation-guard="unknown-outcome" className="text-sm text-text-muted">ยังไม่ทราบผลคำขอเดิม กรุณาลองคำขอเดิมอีกครั้ง ข้อมูลและรหัสคำขอจะคงเดิมจนกว่าจะยืนยันผลได้</p> : null}
    <Button type="submit" hidden={!editorOpen} className="w-full sm:w-auto" loading={pending} disabled={blocked}>{pending ? "กำลังบันทึก..." : !item && recovering ? "ลองคำขอเดิมอีกครั้ง" : item ? "บันทึกการแก้ไข" : "บันทึกการออกกำลังกาย"}</Button>
    </form>
  </div>;
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
    {state.message ? <div role="status">{state.loginHref ? <PatientSelfSessionExpiredAlert href={state.loginHref} message={state.message} /> : <Alert data-navigation-guard={state.status === "UNCONFIRMED" ? "unknown-outcome" : undefined} variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert>}</div> : null}
  </div>;
}
