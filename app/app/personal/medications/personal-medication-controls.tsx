"use client";

import { useActionState, useEffect, useId, useRef, useState, type RefObject } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm, type ConfirmableActionOutcome } from "@/components/ui/confirmable-action-form";
import { Input, inputClassName } from "@/components/ui/input";
import { PatientSelfSessionExpiredAlert } from "../patient-self-session-expired-alert";
import type { PersonalMedicationDto, PersonalMedicationDetailDto } from "@/modules/medications/domain/personal-medication-definitions";
import { MEDICATION_NAME_RAW_MAX_LENGTH, INSTRUCTION_TEXT_RAW_MAX_LENGTH, MEDICATION_SCHEDULE_MAX_TIMES } from "@/modules/medications/domain/personal-medication-definitions";
import { personalMedicationScheduleSchema } from "@/modules/medications/schemas/personal-medication-schemas";
import { INITIAL_PERSONAL_MEDICATION_ACTION_STATE, type PersonalMedicationActionState } from "@/modules/medications/transport/action-state";
import { createPersonalMedicationAction, updatePersonalMedicationAction, stopPersonalMedicationAction, replacePersonalMedicationSchedulesAction } from "@/modules/medications/transport/server-actions";

export type MutationCoordination = {
  blocked: boolean;
  onSubmit: () => void;
  onResult: (state: PersonalMedicationActionState) => void;
};

/** Unsaved text of an open medication edit dialog, kept in memory by the dialog owner. */
export type MedicationTextDraft = { medicationName: string; instructionText: string };
/** Unsaved daily times of an open schedule dialog, kept in memory by the dialog owner. */
export type MedicationScheduleDraft = { times: string[] };

type DialogDraftProps<Draft> = {
  /** Values to resume from instead of the saved values (same medication and version only). */
  initialDraft?: Draft;
  /** Receives the current values so the dialog owner can keep them when the dialog closes. */
  draftRef?: RefObject<Draft | null>;
  /** Closes the surrounding dialog; the saved values are not changed. */
  onCancel?: () => void;
};

function useMedicationAction(
  serverAction: (previous: PersonalMedicationActionState, formData: FormData) => Promise<PersonalMedicationActionState>,
  coordination?: MutationCoordination,
): [PersonalMedicationActionState, (formData: FormData) => void, boolean] {
  const onResult = coordination?.onResult;
  return useActionState(async (previous: PersonalMedicationActionState, formData: FormData) => {
    let result: PersonalMedicationActionState;
    try { result = await serverAction(previous, formData); }
    catch { result = { status: "ERROR", message: "ยังยืนยันการบันทึกไม่ได้ กรุณาโหลดรายการล่าสุดเพื่อตรวจสอบก่อนส่งอีกครั้ง", refreshRequired: true }; }
    // Report to the surviving workspace even when fresh RSC detail remounts this form.
    onResult?.(result);
    return result;
  }, INITIAL_PERSONAL_MEDICATION_ACTION_STATE);
}

export function MedicationFeedback({ state }: { state: PersonalMedicationActionState }): React.JSX.Element | null {
  if (!state.message) return null;
  if (state.loginHref) return <PatientSelfSessionExpiredAlert href={state.loginHref} message={state.message} />;
  return <Alert data-navigation-guard={state.refreshRequired ? "unknown-outcome" : undefined} variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}
    {state.status === "CONFLICT" || state.refreshRequired ? <a className="ml-2 underline" href="/app/personal/medications">โหลดรายการล่าสุด</a> : null}
  </Alert>;
}

export function MedicationEditor({ item, coordination, initialDraft, draftRef, onCancel }: { item?: PersonalMedicationDto; coordination?: MutationCoordination } & DialogDraftProps<MedicationTextDraft>): React.JSX.Element {
  const [state, action, pending] = useMedicationAction(item ? updatePersonalMedicationAction : createPersonalMedicationAction, coordination);
  const [name, setName] = useState(initialDraft?.medicationName ?? item?.medicationName ?? "");
  const [instruction, setInstruction] = useState(initialDraft?.instructionText ?? item?.instructionText ?? "");
  const [times, setTimes] = useState<string[]>([]);
  const [timesError, setTimesError] = useState("");
  const [expectedUpdatedAt] = useState(item?.updatedAt ?? "");
  const prefix = useId();
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  useEffect(() => { if (draftRef) draftRef.current = { medicationName: name, instructionText: instruction }; }, [draftRef, name, instruction]);
  const blocked = coordination?.blocked || pending || state.status === "SUCCESS" || state.status === "CONFLICT" || state.refreshRequired;
  const addPreset = (time: string): void => {
    setTimes((current) => current.includes(time) || current.length >= MEDICATION_SCHEDULE_MAX_TIMES
      ? current
      : [...current, time].sort());
    setTimesError("");
  };
  return <form action={action} onSubmit={(event) => {
    if (!item && new Set(times.filter(Boolean)).size !== times.filter(Boolean).length) {
      event.preventDefault();
      setTimesError("เวลาแต่ละรายการต้องไม่ซ้ำกัน");
      return;
    }
    setTimesError("");
    coordination?.onSubmit();
  }} className="space-y-4">
    {item ? <><input type="hidden" name="medicationId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} /></> : null}
    {!item ? <input type="hidden" name="times" value={JSON.stringify(times)} /> : null}
    <fieldset disabled={Boolean(blocked)} className="space-y-4">
      <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={`${prefix}-name`}>ชื่อยา</label>
        <Input id={`${prefix}-name`} name="medicationName" required maxLength={MEDICATION_NAME_RAW_MAX_LENGTH} value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.medicationName)} aria-describedby={`${prefix}-name-help`} />
        <p id={`${prefix}-name-help`} className="text-sm text-text-muted">{state.fieldErrors?.medicationName ?? "ไม่เกิน 200 ตัวอักษรหลังจัดช่องว่าง"}</p></div>
      <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={`${prefix}-instruction`}>ข้อความประกอบ (ไม่บังคับ)</label>
        <textarea id={`${prefix}-instruction`} name="instructionText" className={`${inputClassName} py-3`} rows={4} maxLength={INSTRUCTION_TEXT_RAW_MAX_LENGTH} value={instruction} onChange={(event) => setInstruction(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.instructionText)} aria-describedby={`${prefix}-instruction-help`} />
        <p id={`${prefix}-instruction-help`} className="text-sm text-text-muted">{state.fieldErrors?.instructionText ?? "ข้อความที่คุณบันทึกเอง ไม่เกิน 2,000 ตัวอักษร"}</p></div>
      {!item ? <section className="space-y-3 border-t border-border pt-4" aria-labelledby={`${prefix}-times-heading`}>
        <h3 id={`${prefix}-times-heading`} className="text-lg font-semibold">เวลาที่ต้องการตั้งเตือน</h3>
        <p className="text-sm leading-6 text-text-muted">เลือกเวลาแนะนำแล้วแก้ไขได้ ระบบจะส่งเตือนทาง LINE เมื่อคุณเปิดการแจ้งเตือนยา เชื่อม LINE และบัญชียังมีสิทธิ์รับข้อความ</p>
        <div className="flex flex-wrap gap-2" aria-label="เวลาแนะนำ">
          {[{ label: "เช้า", time: "07:00" }, { label: "กลางวัน", time: "12:00" }, { label: "เย็น", time: "18:00" }, { label: "ก่อนนอน", time: "21:00" }].map(({ label, time }) => (
            <Button key={time} type="button" variant="secondary" disabled={Boolean(blocked) || times.includes(time) || times.length >= MEDICATION_SCHEDULE_MAX_TIMES} onClick={() => addPreset(time)}>
              {label} {time}{times.includes(time) ? " · เลือกแล้ว" : ""}
            </Button>
          ))}
        </div>
        {times.length > 0 ? <ul className="space-y-3" aria-label="เวลาที่เลือก">
          {times.map((time, index) => <li key={`${time}-${index}`} className="flex flex-wrap items-end gap-3">
            <label className="min-w-32 flex-1 space-y-1">
              <span className="block text-sm font-medium">เวลา {index + 1}</span>
              <Input type="time" step={60} required disabled={Boolean(blocked)} value={time} onChange={(event) => {
                const next = [...times];
                next[index] = event.currentTarget.value;
                setTimes(next);
                setTimesError("");
              }} />
            </label>
            <Button type="button" variant="secondary" disabled={Boolean(blocked)} aria-label={`ลบเวลา ${index + 1}`} onClick={() => setTimes(times.filter((_, currentIndex) => currentIndex !== index))}>ลบเวลา</Button>
          </li>)}
        </ul> : <p className="text-sm text-text-muted">ยังไม่ได้เลือกเวลา คุณเพิ่มหรือจัดการเวลาได้ภายหลัง</p>}
        {times.length >= MEDICATION_SCHEDULE_MAX_TIMES ? <p className="text-sm text-text-muted">รายการนี้มีจำนวนเวลาถึงขีดจำกัดแล้ว</p> : null}
        <p aria-live="polite" className="min-h-6 text-sm text-danger">{timesError || state.fieldErrors?.times || ""}</p>
      </section> : null}
    </fieldset>
    <div ref={feedback} tabIndex={-1}><MedicationFeedback state={state} /></div>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" loading={pending} disabled={Boolean(blocked)}>{pending ? "กำลังบันทึก..." : item ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}</Button>
      {onCancel ? <Button variant="secondary" disabled={pending} onClick={onCancel}>ยกเลิก</Button> : null}
      {state.status === "SUCCESS" ? <a className="text-brand-strong underline" href="/app/personal/medications">กลับไปดูรายการล่าสุด</a> : null}
    </div>
  </form>;
}

function confirmableOutcome(state: PersonalMedicationActionState): ConfirmableActionOutcome {
  if (state.status === "SUCCESS") return "success";
  // A thrown request cannot be replayed safely; the reload-based recovery keeps the dialog in its unknown state.
  if (state.refreshRequired) return "unknown";
  return state.status === "IDLE" ? "idle" : "error";
}

export function MedicationStopForm({ item, coordination }: { item: PersonalMedicationDto; coordination?: MutationCoordination }): React.JSX.Element {
  const [expectedUpdatedAt] = useState(item.updatedAt);
  const [state, action, pending] = useMedicationAction(stopPersonalMedicationAction, coordination);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  const blocked = Boolean(coordination?.blocked || state.status === "SUCCESS" || state.status === "CONFLICT" || state.refreshRequired);
  return <div className="space-y-3 border-t border-border pt-4">
    <ConfirmableActionForm
      action={action}
      aria-label="หยุดติดตามรายการนี้"
      confirmation={{
        title: "หยุดติดตามรายการนี้ใน DEMI",
        description: <span className="break-words font-semibold text-text">{item.medicationName}</span>,
        details: <p>การดำเนินการนี้สิ้นสุดการติดตามใน DEMI เท่านั้น ไม่เปลี่ยนการใช้ยาของคุณ รายการจะอยู่ในประวัติและแก้ไขต่อไม่ได้</p>,
        confirmLabel: "ยืนยันหยุดติดตาม",
        pendingLabel: "กำลังหยุดติดตาม...",
        confirmVariant: "destructive",
      }}
      // Lock text and schedule edits as soon as the stop request is dispatched.
      onSubmitted={coordination?.onSubmit}
      outcome={confirmableOutcome(state)}
      pending={pending}
      resultKey={state}
      returnFocusTarget={() => (state.status === "IDLE" ? null : feedback.current)}
    >
      <input type="hidden" name="medicationId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      <Button type="submit" variant="secondary" disabled={blocked}>หยุดติดตามรายการนี้ใน DEMI</Button>
    </ConfirmableActionForm>
    <div ref={feedback} tabIndex={-1}><MedicationFeedback state={state} /></div>
    {state.status === "SUCCESS" ? <a className="text-brand-strong underline" href="/app/personal/medications">ดูประวัติหยุดติดตาม</a> : null}
  </div>;
}

export function MedicationScheduleEditor({ item, coordination, initialDraft, draftRef, onCancel }: { item: PersonalMedicationDetailDto; coordination?: MutationCoordination } & DialogDraftProps<MedicationScheduleDraft>): React.JSX.Element {
  const [state, action, pending] = useMedicationAction(replacePersonalMedicationSchedulesAction, coordination);
  const [times, setTimes] = useState(initialDraft?.times ?? item.schedules.map(({ localTime }) => localTime));
  const [validation, setValidation] = useState("");
  const [expectedUpdatedAt] = useState(item.updatedAt);
  const prefix = useId();
  const rows = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  useEffect(() => { if (draftRef) draftRef.current = { times }; }, [draftRef, times]);
  const blocked = Boolean(coordination?.blocked || pending || state.status === "SUCCESS" || state.status === "CONFLICT" || state.refreshRequired);
  const error = validation || state.fieldErrors?.times;
  // Rendered inside the schedule dialog, whose title names this task.
  return <div className="space-y-4">
    <p id={`${prefix}-help`} className="text-sm text-text-muted">เวลารายวันตามเวลา Asia/Bangkok ที่คุณบันทึกเอง</p>
    <p className="text-sm text-text-muted">ระบบจะส่งเตือนทาง LINE เมื่อคุณเปิดการแจ้งเตือนยา เชื่อม LINE และบัญชียังมีสิทธิ์รับข้อความ</p>
    <form action={action} className="space-y-4" onSubmit={(event) => {
      if (blocked) { event.preventDefault(); return; }
      const result = personalMedicationScheduleSchema.safeParse({ medicationId: item.id, expectedUpdatedAt, times });
      if (!result.success) {
        event.preventDefault();
        setValidation(new Set(times).size !== times.length ? "เวลาซ้ำกัน กรุณาระบุแต่ละเวลาเพียงครั้งเดียว" : "กรุณาระบุเวลา HH:mm ระดับนาทีให้ครบ หรือลบแถวที่ว่าง");
        requestAnimationFrame(() => feedback.current?.focus());
        return;
      }
      setValidation("");
      coordination?.onSubmit();
    }}>
      <input type="hidden" name="medicationId" value={item.id} />
      <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      <input type="hidden" name="times" value={JSON.stringify(times)} />
      <fieldset disabled={blocked} className="space-y-4" aria-describedby={`${prefix}-help ${prefix}-error`}>
        <div ref={rows} className="space-y-4">
          {times.length === 0 ? <p className="text-text-muted">ยังไม่ได้บันทึกเวลา</p> : times.map((time, index) => <div key={index} className="space-y-2">
            <label className="block text-sm font-medium" htmlFor={`${prefix}-${index}`}>เวลา {index + 1}</label>
            <div className="flex min-w-0 flex-wrap gap-3">
              <Input id={`${prefix}-${index}`} className="min-w-0 flex-1" type="time" step={60} required value={time} aria-invalid={Boolean(error)} aria-describedby={`${prefix}-error`} onChange={(event) => { setTimes(times.map((value, i) => i === index ? event.target.value : value)); setValidation(""); }} />
              <Button variant="secondary" aria-label={`ลบเวลา ${index + 1}`} onClick={() => {
                setTimes(times.filter((_, i) => i !== index)); setValidation("");
                requestAnimationFrame(() => { const inputs = rows.current?.querySelectorAll("input"); (inputs?.[Math.min(index, times.length - 2)] ?? addButton.current)?.focus(); });
              }}>ลบเวลา</Button>
            </div>
          </div>)}
        </div>
        <Button ref={addButton} variant="secondary" disabled={times.length >= MEDICATION_SCHEDULE_MAX_TIMES} onClick={() => {
          setTimes([...times, ""]); setValidation("");
          requestAnimationFrame(() => rows.current?.querySelectorAll("input").item(times.length)?.focus());
        }}>เพิ่มเวลา</Button>
      </fieldset>
      <div ref={feedback} tabIndex={-1}>
        <p id={`${prefix}-error`} role={error ? "alert" : undefined} className="text-sm text-danger">{error}</p>
        <MedicationFeedback state={state} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending} disabled={blocked}>{pending ? "กำลังบันทึกเวลา..." : "บันทึกเวลา"}</Button>
        <Button variant="secondary" disabled={blocked} onClick={() => { setTimes(item.schedules.map(({ localTime }) => localTime)); setValidation(""); }}>{onCancel ? "คืนค่าที่บันทึกไว้" : "ยกเลิก"}</Button>
        {onCancel ? <Button variant="ghost" disabled={pending} onClick={onCancel}>ยกเลิก</Button> : null}
      </div>
    </form>
  </div>;
}
