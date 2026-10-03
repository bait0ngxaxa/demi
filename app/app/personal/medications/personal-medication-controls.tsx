"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import type { PersonalMedicationDto, PersonalMedicationDetailDto } from "@/modules/medications/domain/personal-medication-definitions";
import { MEDICATION_NAME_RAW_MAX_LENGTH, INSTRUCTION_TEXT_RAW_MAX_LENGTH, MEDICATION_SCHEDULE_MAX_TIMES } from "@/modules/medications/domain/personal-medication-definitions";
import { personalMedicationScheduleSchema } from "@/modules/medications/schemas/personal-medication-schemas";
import { INITIAL_PERSONAL_MEDICATION_ACTION_STATE, type PersonalMedicationActionState } from "@/modules/medications/transport/action-state";
import { createPersonalMedicationAction, updatePersonalMedicationAction, stopPersonalMedicationAction, replacePersonalMedicationSchedulesAction } from "@/modules/medications/transport/server-actions";

type MutationCoordination = {
  blocked: boolean;
  onSubmit: () => void;
  onResult: (state: PersonalMedicationActionState) => void;
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
  return <Alert variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}
    {state.status === "CONFLICT" || state.refreshRequired ? <a className="ml-2 underline" href="/app/personal/medications">โหลดรายการล่าสุด</a> : null}
  </Alert>;
}

export function MedicationEditor({ item, coordination }: { item?: PersonalMedicationDto; coordination?: MutationCoordination }): React.JSX.Element {
  const [state, action, pending] = useMedicationAction(item ? updatePersonalMedicationAction : createPersonalMedicationAction, coordination);
  const [name, setName] = useState(item?.medicationName ?? "");
  const [instruction, setInstruction] = useState(item?.instructionText ?? "");
  const [expectedUpdatedAt] = useState(item?.updatedAt ?? "");
  const prefix = useId();
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  const blocked = coordination?.blocked || pending || state.status === "SUCCESS" || state.status === "CONFLICT" || state.refreshRequired;
  return <form action={action} onSubmit={coordination?.onSubmit} className="space-y-4">
    {item ? <><input type="hidden" name="medicationId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} /></> : null}
    <fieldset disabled={Boolean(blocked)} className="space-y-4">
      <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={`${prefix}-name`}>ชื่อยา</label>
        <Input id={`${prefix}-name`} name="medicationName" required maxLength={MEDICATION_NAME_RAW_MAX_LENGTH} value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.medicationName)} aria-describedby={`${prefix}-name-help`} />
        <p id={`${prefix}-name-help`} className="text-sm text-text-muted">{state.fieldErrors?.medicationName ?? "ไม่เกิน 200 ตัวอักษรหลังจัดช่องว่าง"}</p></div>
      <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={`${prefix}-instruction`}>ข้อความประกอบ (ไม่บังคับ)</label>
        <textarea id={`${prefix}-instruction`} name="instructionText" className={`${inputClassName} py-3`} rows={4} maxLength={INSTRUCTION_TEXT_RAW_MAX_LENGTH} value={instruction} onChange={(event) => setInstruction(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.instructionText)} aria-describedby={`${prefix}-instruction-help`} />
        <p id={`${prefix}-instruction-help`} className="text-sm text-text-muted">{state.fieldErrors?.instructionText ?? "ข้อความที่คุณบันทึกเอง ไม่เกิน 2,000 ตัวอักษร"}</p></div>
    </fieldset>
    <div ref={feedback} tabIndex={-1}><MedicationFeedback state={state} /></div>
    <Button type="submit" loading={pending} disabled={Boolean(blocked)}>{pending ? "กำลังบันทึก..." : item ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}</Button>
    {state.status === "SUCCESS" ? <a className="ml-3 text-brand-strong underline" href="/app/personal/medications">กลับไปดูรายการล่าสุด</a> : null}
  </form>;
}

export function MedicationStopForm({ item, coordination }: { item: PersonalMedicationDto; coordination?: MutationCoordination }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [expectedUpdatedAt] = useState(item.updatedAt);
  const [state, action, pending] = useMedicationAction(stopPersonalMedicationAction, coordination);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (confirming) confirmButton.current?.focus(); }, [confirming]);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  if (!confirming) return <Button ref={opener} disabled={coordination?.blocked} variant="secondary" onClick={() => setConfirming(true)}>หยุดติดตามรายการนี้ใน DEMI</Button>;
  return <form action={action} onSubmit={coordination?.onSubmit} className="space-y-4 border-t border-border pt-4" aria-label="ยืนยันหยุดติดตาม" onKeyDown={(event) => {
    if (event.key === "Escape" && !pending) { setConfirming(false); requestAnimationFrame(() => opener.current?.focus()); }
  }}>
    <input type="hidden" name="medicationId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
    <p className="font-semibold">หยุดติดตามรายการนี้ใน DEMI</p>
    <p className="text-text-muted">การดำเนินการนี้สิ้นสุดการติดตามใน DEMI เท่านั้น ไม่เปลี่ยนการใช้ยาของคุณ รายการจะอยู่ในประวัติและแก้ไขต่อไม่ได้</p>
    <div ref={feedback} tabIndex={-1}><MedicationFeedback state={state} /></div>
    <div className="flex flex-wrap gap-3"><Button ref={confirmButton} type="submit" variant="danger" loading={pending} disabled={coordination?.blocked || state.status === "SUCCESS" || state.status === "CONFLICT" || state.refreshRequired}>{pending ? "กำลังหยุดติดตาม..." : "ยืนยันหยุดติดตาม"}</Button>
      <Button variant="secondary" disabled={pending} onClick={() => { setConfirming(false); requestAnimationFrame(() => opener.current?.focus()); }}>ยกเลิก</Button></div>
    {state.status === "SUCCESS" ? <a className="text-brand-strong underline" href="/app/personal/medications">ดูประวัติหยุดติดตาม</a> : null}
  </form>;
}

export function MedicationScheduleEditor({ item, coordination }: { item: PersonalMedicationDetailDto; coordination?: MutationCoordination }): React.JSX.Element {
  const [state, action, pending] = useMedicationAction(replacePersonalMedicationSchedulesAction, coordination);
  const [times, setTimes] = useState(item.schedules.map(({ localTime }) => localTime));
  const [validation, setValidation] = useState("");
  const [expectedUpdatedAt] = useState(item.updatedAt);
  const prefix = useId();
  const rows = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  const blocked = Boolean(coordination?.blocked || pending || state.status === "SUCCESS" || state.status === "CONFLICT" || state.refreshRequired);
  const error = validation || state.fieldErrors?.times;
  return <section aria-labelledby={`${prefix}-heading`} className="space-y-4 border-t border-border pt-4">
    <h3 id={`${prefix}-heading`} className="text-xl font-semibold">เวลาที่ต้องการติดตามใน DEMI</h3>
    <p id={`${prefix}-help`} className="text-sm text-text-muted">เวลารายวันตามเวลา Asia/Bangkok ที่คุณบันทึกเอง</p>
    <p className="text-sm text-text-muted">ส่วนนี้บันทึกเวลาเท่านั้น ยังไม่มีการแจ้งเตือน</p>
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
        <div ref={rows} className="max-h-96 space-y-4 overflow-y-auto">
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
        <Button variant="secondary" disabled={blocked} onClick={() => { setTimes(item.schedules.map(({ localTime }) => localTime)); setValidation(""); }}>ยกเลิก</Button>
      </div>
    </form>
  </section>;
}
