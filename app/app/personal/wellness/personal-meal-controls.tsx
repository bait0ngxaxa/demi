"use client";
import { useActionState, useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import { PatientSelfSessionExpiredAlert } from "../patient-self-session-expired-alert";
import { MEAL_CATEGORIES, MEAL_CATEGORY_LABELS, type PersonalMealDto } from "@/modules/meals/domain/personal-meal";
import type { MealActionState } from "@/modules/meals/transport/action-state";
import { createPersonalMealAction, updatePersonalMealAction, deletePersonalMealAction } from "@/modules/meals/transport/server-actions";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";

/** Unsaved values of an open meal edit dialog, kept in memory by the workspace. */
export type MealDraft = { category: string; occurredOn: string; description: string };
type Coordination = {
  authority: WellnessPrivateAuthority; isActive: () => boolean; onResult: (state: MealActionState) => void; onPending: (pending: boolean) => void; blocked: boolean;
  /**
   * Called from the native submit event (an urgent update) once a request will be dispatched.
   * `onPending(true)` runs inside the action transition, so its state would only commit when the request settles.
   */
  onSubmitting?: () => void;
};
function useMealAction(action: (previous: MealActionState, form: FormData) => Promise<MealActionState>, coordination: Coordination, create = false): [MealActionState, (form: FormData) => void, boolean, boolean, (event: FormEvent<HTMLFormElement>) => void] {
  const payload = useRef<FormData | null>(null);
  // useActionState queues a second submit behind the first; the native submit is refused until the first settles.
  const inFlight = useRef(false);
  const [recovery, setRecovery] = useState<"EDITABLE" | "RETRY_ORIGINAL">("EDITABLE");
  const recovering = recovery === "RETRY_ORIGINAL";
  const [state, dispatch, pending] = useActionState(async (previous: MealActionState, form: FormData) => {
    const authorityGeneration = coordination.authority.captureGeneration();
    if (!coordination.isActive()) return { status: "IDLE" } as const;
    coordination.onPending(true);
    let state: MealActionState;
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
  useEffect(() => { if (!pending) inFlight.current = false; }, [pending]);
  function guardSubmit(event: FormEvent<HTMLFormElement>): void {
    if (inFlight.current) { event.preventDefault(); return; }
    inFlight.current = true;
    coordination.onSubmitting?.();
  }
  return [state, dispatch, pending, recovering, guardSubmit];
}
export function MealEditor({ item, today, maxDate, nonce, coordination, initialDraft, draftRef, onCancel }: {
  item?: PersonalMealDto; today: string; maxDate?: string; nonce: string; coordination: Coordination;
  /** Edit dialog only: values to resume from for the same entry version. */
  initialDraft?: MealDraft;
  draftRef?: RefObject<MealDraft | null>;
  onCancel?: () => void;
}): React.JSX.Element {
  const [state, action, pending, recovering, guardSubmit] = useMealAction(item ? updatePersonalMealAction : createPersonalMealAction, coordination, !item);
  const [category, setCategory] = useState(initialDraft?.category ?? item?.category ?? "");
  const [occurredOn, setOccurredOn] = useState(initialDraft?.occurredOn ?? item?.occurredOn ?? today);
  const [description, setDescription] = useState(initialDraft?.description ?? item?.description ?? "");
  const prefix = useId();
  const feedback = useRef<HTMLDivElement>(null);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  // Focus moves to the details only after the user picks a category, not when an edit opens prefilled.
  const categoryChosen = useRef(false);
  useEffect(() => { if (category && categoryChosen.current) detailsHeading.current?.focus(); }, [category]);
  useEffect(() => { if (state.status !== "IDLE") feedback.current?.focus(); }, [state]);
  useEffect(() => { if (draftRef) draftRef.current = { category, occurredOn, description }; }, [draftRef, category, occurredOn, description]);
  // Retryable create conflicts/ambiguity keep the SAME nonce. Consumed creates require explicit new intent.
  const blocked = coordination.blocked || pending || state.status === "SUCCESS" || state.status === "DENIED" || state.status === "CREATE_CONSUMED" || Boolean(item && (state.status === "CONFLICT" || state.status === "UNCONFIRMED"));
  return <form action={action} onSubmit={guardSubmit} className="space-y-4">
    {item ? <><input type="hidden" name="entryId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={item.updatedAt} /></> : <input type="hidden" name="submissionNonce" value={nonce} />}
    <fieldset disabled={blocked || recovering} className="space-y-4">
      <fieldset className="space-y-2" aria-invalid={Boolean(state.fieldErrors?.category)} aria-describedby={`${prefix}-category-help`}>
        <legend className="mb-2 text-sm font-medium">หมวดมื้ออาหาร</legend>
        <div className="grid gap-3 sm:grid-cols-2">{MEAL_CATEGORIES.map((value) => <label key={value} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-control border p-3 focus-within:ring-4 focus-within:ring-focus-ring ${category === value ? "border-brand bg-brand-soft text-brand-strong" : "border-border bg-surface hover:bg-surface-muted"}`}>
          <input type="radio" name="category" value={value} required checked={category === value} onChange={() => { categoryChosen.current = true; setCategory(value); }} aria-controls={`${prefix}-details`} className="accent-brand" />
          <span className="min-w-0 flex-1 text-base font-medium">{MEAL_CATEGORY_LABELS[value]}</span><span className="text-sm font-medium text-brand-strong">{item ? "เลือกมื้ออาหาร" : "เพิ่มบันทึก"}</span>
        </label>)}</div>
        <p id={`${prefix}-category-help`} className="text-sm text-text-muted">{state.fieldErrors?.category ?? "เลือกตามมื้อที่คุณต้องการบันทึก"}</p>
      </fieldset>
      <div id={`${prefix}-details`} hidden={!category} className="space-y-4">
      <h4 ref={detailsHeading} tabIndex={-1} className="text-base font-semibold">รายละเอียดมื้ออาหาร</h4>
      <div className="space-y-2"><label htmlFor={`${prefix}-date`} className="block text-sm font-medium">วันที่รับประทาน</label>
        <Input id={`${prefix}-date`} type="date" name="occurredOn" required min="0001-01-01" max={maxDate} value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.occurredOn)} aria-describedby={`${prefix}-date-help`} />
        <p id={`${prefix}-date-help`} className="text-sm text-text-muted">{state.fieldErrors?.occurredOn ?? "วันนี้หรือวันที่ผ่านมาแล้ว ตามเวลาไทย (Asia/Bangkok)"}</p></div>
      <div className="space-y-2"><label htmlFor={`${prefix}-description`} className="block text-sm font-medium">รายละเอียด (ไม่บังคับ)</label>
        <textarea id={`${prefix}-description`} className={`${inputClassName} py-3`} name="description" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.description)} aria-describedby={`${prefix}-description-help`} />
        <p id={`${prefix}-description-help`} className="text-sm text-text-muted">{state.fieldErrors?.description ?? "ไม่เกิน 1,000 ตัวอักษรหลังตัดช่องว่างหัวท้าย"}</p></div>
      </div>
    </fieldset>
    <div ref={feedback} tabIndex={-1} role="status">{state.message ? state.loginHref ? <PatientSelfSessionExpiredAlert href={state.loginHref} message={state.message} /> : <Alert data-navigation-guard={state.status === "UNCONFIRMED" ? "unknown-outcome" : undefined} variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert> : null}</div>
    {recovering ? <p data-navigation-guard="unknown-outcome" className="text-sm text-text-muted">ยังไม่ทราบผลคำขอเดิม กรุณาลองคำขอเดิมอีกครั้ง ข้อมูลและรหัสคำขอจะคงเดิมจนกว่าจะยืนยันผลได้</p> : null}
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button type="submit" className="w-full sm:w-auto" hidden={!category} loading={pending} disabled={blocked}>{pending ? "กำลังบันทึก..." : !item && recovering ? "ลองคำขอเดิมอีกครั้ง" : item ? "บันทึกการแก้ไข" : "บันทึกมื้ออาหาร"}</Button>
      {onCancel ? <Button className="w-full sm:w-auto" variant="secondary" disabled={pending} onClick={onCancel}>ยกเลิก</Button> : null}
    </div>
  </form>;
}
/** The confirmation step of deleting one entry; rendered inside the workspace's destructive dialog. */
export function MealDeleteForm({ item, coordination, onCancel }: { item: PersonalMealDto; coordination: Coordination; onCancel: () => void }): React.JSX.Element {
  const [state, action, pending, , guardSubmit] = useMealAction(deletePersonalMealAction, coordination);
  const cancel = useRef<HTMLButtonElement>(null);
  // The least destructive action receives focus when the dialog opens.
  useEffect(() => { cancel.current?.focus(); }, []);
  const blocked = coordination.blocked || pending || state.status !== "IDLE";
  return <div className="space-y-3 border-t border-border pt-4">
    <form action={action} onSubmit={guardSubmit} className="space-y-3" aria-label="ยืนยันลบบันทึก">
      <p>ลบบันทึกมื้ออาหารนี้ออกจากรายการปัจจุบันใน DEMI?</p>
      <input type="hidden" name="entryId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={item.updatedAt} />
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end"><Button ref={cancel} className="w-full sm:w-auto" variant="secondary" disabled={pending} onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" className="w-full sm:w-auto" variant="danger" loading={pending} disabled={blocked}>{pending ? "กำลังลบ..." : "ยืนยันลบ"}</Button></div>
    </form>
    {state.message ? <div role="status">{state.loginHref ? <PatientSelfSessionExpiredAlert href={state.loginHref} message={state.message} /> : <Alert data-navigation-guard={state.status === "UNCONFIRMED" ? "unknown-outcome" : undefined} variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert>}</div> : null}
  </div>;
}
