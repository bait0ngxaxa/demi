"use client";

import { useActionState, useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PersonalWeightGoalDto } from "@/modules/weight-goals/domain/personal-weight-goal";
import { weightGoalDateAfterWeeks } from "@/modules/weight-goals/domain/personal-weight-goal";
import type { PersonalWeightGoalActionState } from "@/modules/weight-goals/transport/action-state";
import {
  createPersonalWeightGoalAction,
  removePersonalWeightGoalAction,
  updatePersonalWeightGoalAction,
} from "@/modules/weight-goals/transport/server-actions";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";

/** Unsaved values of an open goal edit dialog, kept in memory by the workspace. */
export type WeightGoalDraft = { targetWeightKg: string; targetDate: string; weeks: number };

export type Coordination = {
  authority: WellnessPrivateAuthority;
  isActive: () => boolean;
  blocked: boolean;
  onResult: (state: PersonalWeightGoalActionState) => void;
  onPending: (pending: boolean) => void;
  /**
   * Called from the native submit event (an urgent update) once a request will be dispatched.
   * `onPending(true)` runs inside the action transition, so its state would only commit when the request settles.
   */
  onSubmitting?: () => void;
};

function useWeightGoalAction(
  action: (previous: PersonalWeightGoalActionState, formData: FormData) => Promise<PersonalWeightGoalActionState>,
  coordination: Coordination,
): [PersonalWeightGoalActionState, (formData: FormData) => void, boolean, (event: FormEvent<HTMLFormElement>) => void] {
  const requestGeneration = useRef(0);
  // useActionState queues a second submit behind the first; the native submit is refused until the first settles.
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
    };
  }, []);
  const [state, dispatch, pending] = useActionState(async (previous: PersonalWeightGoalActionState, formData: FormData) => {
    const capturedRequest = ++requestGeneration.current;
    const capturedGeneration = coordination.authority.captureGeneration();
    const isCurrent = (): boolean => mounted.current && capturedRequest === requestGeneration.current && coordination.isActive() && coordination.authority.isCurrent(capturedGeneration);
    if (!isCurrent()) return { status: "IDLE" } as const;
    coordination.onPending(true);
    let state: PersonalWeightGoalActionState;
    try {
      state = await action(previous, formData);
    } catch {
      state = { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้ กรุณาลองคำขอเดิมอีกครั้ง" };
    }
    if (!isCurrent()) return { status: "IDLE" } as const;
    coordination.onPending(false);
    coordination.onResult(state);
    return isCurrent() ? state : { status: "IDLE" } as const;
  }, { status: "IDLE" });
  useEffect(() => { if (!pending) inFlight.current = false; }, [pending]);
  function guardSubmit(event: FormEvent<HTMLFormElement>): void {
    if (inFlight.current) { event.preventDefault(); return; }
    inFlight.current = true;
    coordination.onSubmitting?.();
  }
  return [state, dispatch, pending, guardSubmit];
}

export function PersonalWeightGoalEditor({
  goal,
  nonce,
  coordination,
  initialDraft,
  draftRef,
}: {
  goal?: PersonalWeightGoalDto;
  nonce: string;
  coordination: Coordination;
  /** Edit dialog only: values to resume from for the same goal version. */
  initialDraft?: WeightGoalDraft;
  draftRef?: RefObject<WeightGoalDraft | null>;
}): React.JSX.Element {
  const [state, action, pending, guardSubmit] = useWeightGoalAction(goal ? updatePersonalWeightGoalAction : createPersonalWeightGoalAction, coordination);
  // Opening an edit shows the saved date; only "ใช้ระยะเวลานี้" or a manual change replaces it.
  const [targetWeightKg, setTargetWeightKg] = useState(initialDraft?.targetWeightKg ?? goal?.targetWeightKg ?? "");
  const [targetDate, setTargetDate] = useState(initialDraft?.targetDate ?? goal?.targetDate ?? "");
  const [weeks, setWeeks] = useState(initialDraft?.weeks ?? 4);
  const prefix = useId();
  const feedback = useRef<HTMLDivElement>(null);
  const uncertain = state.status === "UNCONFIRMED";
  const blocked = coordination.blocked || pending || state.status === "SUCCESS" || state.status === "DENIED" || state.status === "CREATE_CONSUMED" || (uncertain && Boolean(goal));
  const fieldsDisabled = blocked || uncertain;

  useEffect(() => {
    if (state.status !== "IDLE") feedback.current?.focus();
  }, [state]);
  useEffect(() => {
    if (draftRef) draftRef.current = { targetWeightKg, targetDate, weeks };
  }, [draftRef, targetWeightKg, targetDate, weeks]);

  return <form action={action} onSubmit={guardSubmit} className="space-y-4">
    {goal ? <><input type="hidden" name="goalId" value={goal.id} /><input type="hidden" name="expectedUpdatedAt" value={goal.updatedAt} /></> : <input type="hidden" name="submissionNonce" value={nonce} />}
      <fieldset disabled={fieldsDisabled} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={`${prefix}-weight`} className="block text-sm font-medium">น้ำหนักเป้าหมาย (กก.)</label>
        <Input
          id={`${prefix}-weight`}
          name="targetWeightKg"
          type="text"
          inputMode="decimal"
          required
          maxLength={11}
          value={targetWeightKg}
          onChange={(event) => setTargetWeightKg(event.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.targetWeightKg)}
          aria-describedby={`${prefix}-weight-help`}
        />
        <p id={`${prefix}-weight-help`} className="text-sm text-text-muted">
          {state.fieldErrors?.targetWeightKg ?? "ทศนิยมได้ไม่เกิน 3 ตำแหน่ง"}
        </p>
      </div>
      <div className="space-y-3 rounded-control bg-surface-muted p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor={`${prefix}-weeks`} className="text-sm font-medium">ระยะเวลาจากวันนี้</label><output htmlFor={`${prefix}-weeks`} className="font-semibold text-brand-strong">{weeks} สัปดาห์</output></div>
        <input id={`${prefix}-weeks`} type="range" min={1} max={26} step={1} value={weeks} onChange={(event) => setWeeks(Number(event.target.value))} aria-valuetext={`${weeks} สัปดาห์`} aria-describedby={`${prefix}-weeks-help`} className="min-h-11 w-full accent-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" />
        <div className="flex justify-between text-xs text-text-muted"><span>1 สัปดาห์</span><span>26 สัปดาห์</span></div>
        <p id={`${prefix}-weeks-help`} className="text-sm text-text-muted">เลื่อนแล้วกดใช้ระยะเวลาเพื่อเปลี่ยนวันที่เป้าหมาย โดยนับจากวันนี้ตามเวลาไทย วันที่เดิมจะคงอยู่จนกว่าคุณจะเลือกเปลี่ยน</p>
        <Button variant="secondary" size="compact" onClick={() => setTargetDate(weightGoalDateAfterWeeks(weeks, new Date()))}>ใช้ระยะเวลานี้</Button>
      </div>
      <div className="space-y-2">
        <label htmlFor={`${prefix}-date`} className="block text-sm font-medium">วันที่เป้าหมาย (ไม่บังคับ)</label>
        <Input
          id={`${prefix}-date`}
          name="targetDate"
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.targetDate)}
          aria-describedby={`${prefix}-date-help`}
        />
        <p id={`${prefix}-date-help`} className="text-sm text-text-muted">
          {state.fieldErrors?.targetDate ?? "เว้นว่างได้; วันที่ใหม่ต้องเป็นวันนี้หรือวันข้างหน้า ตามเวลาไทย"}
        </p>
      </div>
      </fieldset>
    {uncertain && !goal ? <>
      <input type="hidden" name="targetWeightKg" value={targetWeightKg} />
      <input type="hidden" name="targetDate" value={targetDate} />
    </> : null}
    <div ref={feedback} tabIndex={-1} role="status" aria-live="polite">
      {state.message ? <Alert variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert> : null}
    </div>
    <Button type="submit" loading={pending} disabled={coordination.blocked || pending || state.status === "SUCCESS" || state.status === "DENIED" || state.status === "CREATE_CONSUMED" || (uncertain && Boolean(goal))}>
      {pending ? "กำลังบันทึก..." : uncertain && !goal ? "ลองคำขอเดิมอีกครั้ง" : goal ? "บันทึกการแก้ไข" : "บันทึกเป้าหมาย"}
    </Button>
  </form>;
}

export function PersonalWeightGoalRemoveConfirmation({
  goal,
  coordination,
  onCancel,
}: {
  goal: PersonalWeightGoalDto;
  coordination: Coordination;
  onCancel: () => void;
}): React.JSX.Element {
  const [state, action, pending, guardSubmit] = useWeightGoalAction(removePersonalWeightGoalAction, coordination);
  const cancel = useRef<HTMLButtonElement>(null);
  // The least destructive action receives focus when the confirmation opens.
  useEffect(() => { cancel.current?.focus(); }, []);
  const blocked = coordination.blocked || pending || state.status !== "IDLE";
  return <div className="space-y-3 border-t border-border pt-4">
    <p>ลบเป้าหมายน้ำหนักปัจจุบันออกจากข้อมูลที่บันทึกไว้?</p>
    <p className="text-sm text-text-muted">การลบเป้าหมายไม่ลบบันทึกน้ำหนักที่คุณวัดเองใน “ตัวฉันในตอนนี้”</p>
    <form action={action} onSubmit={guardSubmit} className="flex flex-col gap-3 sm:flex-row sm:justify-end" aria-label="ยืนยันการลบเป้าหมายน้ำหนัก">
      <input type="hidden" name="goalId" value={goal.id} />
      <input type="hidden" name="expectedUpdatedAt" value={goal.updatedAt} />
      <Button type="button" ref={cancel} className="w-full sm:w-auto" variant="secondary" disabled={pending} onClick={onCancel}>ยกเลิก</Button>
      <Button type="submit" className="w-full sm:w-auto" variant="danger" loading={pending} disabled={blocked}>{pending ? "กำลังลบ..." : "ยืนยันลบเป้าหมาย"}</Button>
    </form>
    {state.message ? <div role="status" aria-live="polite"><Alert variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert></div> : null}
  </div>;
}
