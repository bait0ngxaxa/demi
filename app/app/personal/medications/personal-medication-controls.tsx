"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import type { PersonalMedicationDto } from "@/modules/medications/domain/personal-medication-definitions";
import { MEDICATION_NAME_RAW_MAX_LENGTH, INSTRUCTION_TEXT_RAW_MAX_LENGTH } from "@/modules/medications/domain/personal-medication-definitions";
import { INITIAL_PERSONAL_MEDICATION_ACTION_STATE, type PersonalMedicationActionState } from "@/modules/medications/transport/action-state";
import { createPersonalMedicationAction, updatePersonalMedicationAction, stopPersonalMedicationAction } from "@/modules/medications/transport/server-actions";

export function MedicationFeedback({ state }: { state: PersonalMedicationActionState }): React.JSX.Element | null {
  if (!state.message) return null;
  return <Alert variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}
    {state.status === "CONFLICT" || state.refreshRequired ? <a className="ml-2 underline" href="/app/personal/medications">โหลดรายการล่าสุด</a> : null}
  </Alert>;
}

export function MedicationEditor({ item }: { item?: PersonalMedicationDto }): React.JSX.Element {
  const [state, action, pending] = useActionState(item ? updatePersonalMedicationAction : createPersonalMedicationAction, INITIAL_PERSONAL_MEDICATION_ACTION_STATE);
  const [name, setName] = useState(item?.medicationName ?? "");
  const [instruction, setInstruction] = useState(item?.instructionText ?? "");
  const [expectedUpdatedAt] = useState(item?.updatedAt ?? "");
  const prefix = useId();
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  const blocked = pending || state.status === "SUCCESS" || state.status === "CONFLICT" || state.refreshRequired;
  return <form action={action} className="space-y-4">
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

export function MedicationStopForm({ item }: { item: PersonalMedicationDto }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [expectedUpdatedAt] = useState(item.updatedAt);
  const [state, action, pending] = useActionState(stopPersonalMedicationAction, INITIAL_PERSONAL_MEDICATION_ACTION_STATE);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (confirming) confirmButton.current?.focus(); }, [confirming]);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  if (!confirming) return <Button ref={opener} variant="secondary" onClick={() => setConfirming(true)}>หยุดติดตามรายการนี้ใน DEMI</Button>;
  return <form action={action} className="space-y-4 border-t border-border pt-4" aria-label="ยืนยันหยุดติดตาม" onKeyDown={(event) => {
    if (event.key === "Escape" && !pending) { setConfirming(false); requestAnimationFrame(() => opener.current?.focus()); }
  }}>
    <input type="hidden" name="medicationId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
    <p className="font-semibold">หยุดติดตามรายการนี้ใน DEMI</p>
    <p className="text-text-muted">การดำเนินการนี้สิ้นสุดการติดตามใน DEMI เท่านั้น ไม่เปลี่ยนการใช้ยาของคุณ รายการจะอยู่ในประวัติและแก้ไขต่อไม่ได้</p>
    <div ref={feedback} tabIndex={-1}><MedicationFeedback state={state} /></div>
    <div className="flex flex-wrap gap-3"><Button ref={confirmButton} type="submit" variant="danger" loading={pending} disabled={state.status === "SUCCESS" || state.status === "CONFLICT" || state.refreshRequired}>{pending ? "กำลังหยุดติดตาม..." : "ยืนยันหยุดติดตาม"}</Button>
      <Button variant="secondary" disabled={pending} onClick={() => { setConfirming(false); requestAnimationFrame(() => opener.current?.focus()); }}>ยกเลิก</Button></div>
    {state.status === "SUCCESS" ? <a className="text-brand-strong underline" href="/app/personal/medications">ดูประวัติหยุดติดตาม</a> : null}
  </form>;
}
