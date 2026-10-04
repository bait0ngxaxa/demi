"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PersonalWeightGoalDto } from "@/modules/weight-goals/domain/personal-weight-goal";
import type { PersonalWeightGoalActionState } from "@/modules/weight-goals/transport/action-state";
import {
  createPersonalWeightGoalAction,
  removePersonalWeightGoalAction,
  updatePersonalWeightGoalAction,
} from "@/modules/weight-goals/transport/server-actions";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";

export type Coordination = {
  authority: WellnessPrivateAuthority;
  isActive: () => boolean;
  blocked: boolean;
  onResult: (state: PersonalWeightGoalActionState) => void;
  onPending: (pending: boolean) => void;
};

function useWeightGoalAction(
  action: (previous: PersonalWeightGoalActionState, formData: FormData) => Promise<PersonalWeightGoalActionState>,
  coordination: Coordination,
): [PersonalWeightGoalActionState, (formData: FormData) => void, boolean] {
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
    };
  }, []);
  return useActionState(async (previous: PersonalWeightGoalActionState, formData: FormData) => {
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
}

export function PersonalWeightGoalEditor({
  goal,
  nonce,
  coordination,
}: {
  goal?: PersonalWeightGoalDto;
  nonce: string;
  coordination: Coordination;
}): React.JSX.Element {
  const [state, action, pending] = useWeightGoalAction(goal ? updatePersonalWeightGoalAction : createPersonalWeightGoalAction, coordination);
  const [targetWeightKg, setTargetWeightKg] = useState(goal?.targetWeightKg ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const prefix = useId();
  const feedback = useRef<HTMLDivElement>(null);
  const uncertain = state.status === "UNCONFIRMED";
  const blocked = coordination.blocked || pending || state.status === "SUCCESS" || state.status === "DENIED" || state.status === "CREATE_CONSUMED" || (uncertain && Boolean(goal));
  const fieldsDisabled = blocked || uncertain;

  useEffect(() => {
    if (state.status !== "IDLE") feedback.current?.focus();
  }, [state]);

  return <form action={action} className="space-y-4">
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
  const [state, action, pending] = useWeightGoalAction(removePersonalWeightGoalAction, coordination);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirm.current?.focus(); }, []);
  const blocked = coordination.blocked || pending || state.status !== "IDLE";
  return <div className="space-y-3 border-t border-border pt-4">
    <p>ลบเป้าหมายน้ำหนักปัจจุบันออกจากข้อมูลที่บันทึกไว้?</p>
    <form action={action} className="flex flex-wrap gap-2" aria-label="ยืนยันการลบเป้าหมายน้ำหนัก">
      <input type="hidden" name="goalId" value={goal.id} />
      <input type="hidden" name="expectedUpdatedAt" value={goal.updatedAt} />
      <Button type="submit" ref={confirm} variant="danger" loading={pending} disabled={blocked}>{pending ? "กำลังลบ..." : "ยืนยันลบเป้าหมาย"}</Button>
      <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>ยกเลิก</Button>
    </form>
    {state.message ? <div role="status" aria-live="polite"><Alert variant={state.status === "SUCCESS" ? "success" : "danger"}>{state.message}</Alert></div> : null}
  </div>;
}
