"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import { PatientSelfSessionExpiredAlert } from "../patient-self-session-expired-alert";
import { MEAL_CATEGORIES, MEAL_CATEGORY_LABELS, type PersonalMealDto } from "@/modules/meals/domain/personal-meal";
import type { MealActionState } from "@/modules/meals/transport/action-state";
import { createPersonalMealAction, updatePersonalMealAction, deletePersonalMealAction } from "@/modules/meals/transport/server-actions";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";

type Coordination = { authority: WellnessPrivateAuthority; isActive: () => boolean; onResult: (state: MealActionState) => void; onPending: (pending: boolean) => void; blocked: boolean };
function useMealAction(action: (previous: MealActionState, form: FormData) => Promise<MealActionState>, coordination: Coordination): [MealActionState, (form: FormData) => void, boolean] {
  return useActionState(async (previous: MealActionState, form: FormData) => {
    const authorityGeneration = coordination.authority.captureGeneration();
    if (!coordination.isActive()) return { status: "IDLE" } as const;
    coordination.onPending(true);
    let state: MealActionState;
    try { state = await action(previous, form); }
    catch { state = { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้ กรุณาลองคำขอเดิมอีกครั้ง" }; }
    if (!coordination.isActive() || !coordination.authority.isCurrent(authorityGeneration)) return { status: "IDLE" } as const;
    coordination.onPending(false);
    coordination.onResult(state);
    return coordination.isActive() && coordination.authority.isCurrent(authorityGeneration) ? state : { status: "IDLE" } as const;
  }, { status: "IDLE" });
}
export function MealEditor({ item, today, nonce, coordination }: { item?: PersonalMealDto; today: string; nonce: string; coordination: Coordination }): React.JSX.Element {
  const [state, action, pending] = useMealAction(item ? updatePersonalMealAction : createPersonalMealAction, coordination);
  const [category, setCategory] = useState(item?.category ?? "");
  const [occurredOn, setOccurredOn] = useState(item?.occurredOn ?? today);
  const [description, setDescription] = useState(item?.description ?? "");
  const prefix = useId();
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  // Retryable create conflicts/ambiguity keep the SAME nonce. Consumed creates require explicit new intent.
  const blocked = coordination.blocked || pending || state.status === "SUCCESS" || state.status === "DENIED" || state.status === "CREATE_CONSUMED" || Boolean(item && (state.status === "CONFLICT" || state.status === "UNCONFIRMED"));
  return <form action={action} className="space-y-4">
    {item ? <><input type="hidden" name="entryId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={item.updatedAt} /></> : <input type="hidden" name="submissionNonce" value={nonce} />}
    <fieldset disabled={blocked} className="space-y-4">
      <fieldset className="space-y-2" aria-describedby={`${prefix}-category-help`}>
        <legend className="mb-2 text-sm font-medium">หมวดมื้ออาหาร</legend>
        <div className="grid grid-cols-2 gap-2">{MEAL_CATEGORIES.map((value) => <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-control border p-3 focus-within:ring-4 focus-within:ring-focus-ring ${category === value ? "border-brand bg-brand-soft text-brand-strong" : "border-border bg-surface hover:bg-surface-muted"}`}>
          <input type="radio" name="category" value={value} required checked={category === value} onChange={() => setCategory(value)} aria-invalid={Boolean(state.fieldErrors?.category)} className="accent-brand" />
          <span className="min-w-0 text-sm font-medium">{MEAL_CATEGORY_LABELS[value]}<span className="block text-xs">{item ? "เลือกมื้ออาหาร" : "เพิ่มบันทึก"}</span></span>
        </label>)}</div>
        <p id={`${prefix}-category-help`} className="text-sm text-text-muted">{state.fieldErrors?.category ?? "เลือกตามมื้อที่คุณต้องการบันทึก"}</p>
      </fieldset>
      <div className="space-y-2"><label htmlFor={`${prefix}-date`} className="block text-sm font-medium">วันที่รับประทาน</label>
        <Input id={`${prefix}-date`} type="date" name="occurredOn" required min="0001-01-01" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.occurredOn)} aria-describedby={`${prefix}-date-help`} />
        <p id={`${prefix}-date-help`} className="text-sm text-text-muted">{state.fieldErrors?.occurredOn ?? "วันนี้หรือวันที่ผ่านมาแล้ว ตามเวลาไทย (Asia/Bangkok)"}</p></div>
      <div className="space-y-2"><label htmlFor={`${prefix}-description`} className="block text-sm font-medium">รายละเอียด (ไม่บังคับ)</label>
        <textarea id={`${prefix}-description`} className={`${inputClassName} py-3`} name="description" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.description)} aria-describedby={`${prefix}-description-help`} />
        <p id={`${prefix}-description-help`} className="text-sm text-text-muted">{state.fieldErrors?.description ?? "ไม่เกิน 1,000 ตัวอักษรหลังตัดช่องว่างหัวท้าย"}</p></div>
    </fieldset>
    <div ref={feedback} tabIndex={-1} role="status">{state.message ? state.loginHref ? <PatientSelfSessionExpiredAlert href={state.loginHref} message={state.message} /> : <Alert data-navigation-guard={state.status === "UNCONFIRMED" ? "unknown-outcome" : undefined} variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert> : null}</div>
    <Button type="submit" loading={pending} disabled={blocked}>{pending ? "กำลังบันทึก..." : !item && (state.status === "UNCONFIRMED" || state.status === "CONFLICT") ? "ลองคำขอเดิมอีกครั้ง" : item ? "บันทึกการแก้ไข" : "บันทึกมื้ออาหาร"}</Button>
  </form>;
}
export function MealDeleteForm({ item, coordination }: { item: PersonalMealDto; coordination: Coordination }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useMealAction(deletePersonalMealAction, coordination);
  const opener = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirming) confirm.current?.focus(); }, [confirming]);
  const blocked = coordination.blocked || pending || state.status !== "IDLE";
  return <div className="space-y-3 border-t border-border pt-4">
    <Button ref={opener} variant="danger" disabled={blocked} onClick={() => setConfirming(true)}>ลบบันทึกนี้</Button>
    {confirming ? <form action={action} className="space-y-3" aria-label="ยืนยันลบบันทึก">
      <p>ลบบันทึกมื้ออาหารนี้ออกจากรายการปัจจุบันใน DEMI?</p>
      <input type="hidden" name="entryId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={item.updatedAt} />
      <div className="flex flex-wrap gap-2"><Button ref={confirm} type="submit" variant="danger" loading={pending} disabled={blocked}>{pending ? "กำลังลบ..." : "ยืนยันลบ"}</Button>
        <Button variant="secondary" disabled={pending} onClick={() => { setConfirming(false); opener.current?.focus(); }}>ยกเลิก</Button></div>
    </form> : null}
    {state.message ? <div role="status">{state.loginHref ? <PatientSelfSessionExpiredAlert href={state.loginHref} message={state.message} /> : <Alert data-navigation-guard={state.status === "UNCONFIRMED" ? "unknown-outcome" : undefined} variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert>}</div> : null}
  </div>;
}
