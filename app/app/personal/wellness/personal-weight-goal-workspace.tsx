"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { PersonalWeightGoalDto } from "@/modules/weight-goals/domain/personal-weight-goal";
import type { PersonalWeightGoalActionState } from "@/modules/weight-goals/transport/action-state";
import { readPersonalWeightGoalAction } from "@/modules/weight-goals/transport/server-actions";
import { PersonalWeightGoalEditor, PersonalWeightGoalRemoveConfirmation, type Coordination } from "./personal-weight-goal-controls";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";

export function PersonalWeightGoalReadback({ goal }: { goal: PersonalWeightGoalDto }): React.JSX.Element {
  return <div className="space-y-2">
    <p className="text-text-muted">เป้าหมายส่วนตัวที่คุณตั้งไว้</p>
    <p className="text-2xl font-semibold">{goal.targetWeightKg} กก.</p>
    {goal.targetDate ? <p className="text-text-muted">วันที่เป้าหมาย: <time dateTime={goal.targetDate}>{goal.targetDate}</time></p> : null}
  </div>;
}

export function PersonalWeightGoalWorkspace({
  initialGoal,
  initialNonce,
  authority,
}: {
  initialGoal: PersonalWeightGoalDto | null;
  initialNonce: string;
  authority: WellnessPrivateAuthority;
}): React.JSX.Element {
  const [goal, setGoal] = useState(initialGoal);
  const [nonce, setNonce] = useState(initialNonce);
  const [nonceClaimed, setNonceClaimed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [requiresCurrentGoalReview, setRequiresCurrentGoalReview] = useState(false);
  const [feedback, setFeedback] = useState<PersonalWeightGoalActionState>({ status: "IDLE" });
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const requestGeneration = useRef(0);
  const active = useRef(true);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const removeOpener = useRef<HTMLButtonElement>(null);
  const restoreRemoveFocus = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      requestGeneration.current += 1;
    };
  }, []);
  useEffect(() => {
    if (creating || editing) editorHeading.current?.focus();
  }, [creating, editing]);
  useEffect(() => {
    if (!confirmingRemove && restoreRemoveFocus.current && active.current && authority.isActive()) {
      restoreRemoveFocus.current = false;
      removeOpener.current?.focus();
    }
  }, [confirmingRemove, authority]);

  function clearPrivateState(): void {
    active.current = false;
    requestGeneration.current += 1;
    setGoal(null);
    setNonce("");
    setCreating(false);
    setEditing(false);
    setConfirmingRemove(false);
    setRequiresCurrentGoalReview(false);
    restoreRemoveFocus.current = false;
    setFeedback({ status: "IDLE" });
  }

  function onResult(state: PersonalWeightGoalActionState): void {
    if (!active.current || !authority.isActive()) return;
    if (state.status === "DENIED") {
      authority.invalidate();
      clearPrivateState();
      return;
    }
    setFeedback(state);
    const result = state.result;
    if (!result) {
      if (state.status === "CREATE_CONSUMED") {
        setRequiresCurrentGoalReview(true);
        setCreating(false);
        setEditing(false);
        setConfirmingRemove(false);
      }
      return;
    }
    if (result.outcome === "DELETED") {
      setGoal(null);
      setCreating(false);
      setEditing(false);
      setConfirmingRemove(false);
      return;
    }
    if ("goal" in result) {
      setGoal(result.goal);
      setCreating(false);
      setEditing(false);
      setConfirmingRemove(false);
    }
  }

  function refresh(): void {
    const capturedRequest = requestGeneration.current;
    const capturedAuthority = authority.captureGeneration();
    startTransition(async () => {
      let state: PersonalWeightGoalActionState;
      try {
        state = await readPersonalWeightGoalAction(new FormData());
      } catch {
        state = { status: "UNCONFIRMED", message: "ยังโหลดเป้าหมายล่าสุดไม่ได้ กรุณาลองอีกครั้ง" };
      }
      if (!active.current || capturedRequest !== requestGeneration.current || !authority.isCurrent(capturedAuthority)) return;
      if (state.status === "DENIED") {
        authority.invalidate();
        clearPrivateState();
        return;
      }
      if (state.status === "SUCCESS" && state.currentGoal !== undefined) {
        setGoal(state.currentGoal);
        setRequiresCurrentGoalReview(false);
        setCreating(false);
        setEditing(false);
        setConfirmingRemove(false);
        setFeedback({ status: "IDLE" });
      } else {
        setFeedback(state);
      }
    });
  }

  function startCreate(): void {
    if (goal !== null || requiresCurrentGoalReview || saving || pending) return;
    if (nonceClaimed) setNonce(crypto.randomUUID());
    setNonceClaimed(true);
    setFeedback({ status: "IDLE" });
    setCreating(true);
  }

  const lockedForReview = feedback.status === "CONFLICT" || (feedback.status === "UNCONFIRMED" && (editing || confirmingRemove));
  const editorOpen = creating || editing || confirmingRemove;
  const isActive = (): boolean => active.current && authority.isActive();
  const onPending = (value: boolean): void => {
      if (active.current && authority.isActive()) setSaving(value);
  };
  const coordination: Coordination = { authority, isActive, blocked: saving || pending, onResult, onPending };
  const reviewCoordination: Coordination = {
    authority,
    isActive,
    blocked: saving || pending || lockedForReview,
    onResult,
    onPending,
  };

  return <div className="space-y-5">
    <h2 className="text-2xl font-semibold">เป้าหมายน้ำหนัก</h2>
    {!editorOpen && feedback.message ? <div role="status" aria-live="polite"><Alert variant={feedback.status === "SUCCESS" ? "success" : "danger"}>{feedback.message}</Alert></div> : null}

    {requiresCurrentGoalReview ? <div className="space-y-3">
      <p className="text-text-muted">โหลดข้อมูลล่าสุดเพื่อทบทวนเป้าหมายปัจจุบันก่อนเริ่มคำขอใหม่</p>
      <Button variant="secondary" loading={pending} disabled={saving} onClick={refresh}>โหลดข้อมูลล่าสุด</Button>
    </div> : goal ? <Panel>
      <div className="space-y-4">
        <PersonalWeightGoalReadback goal={goal} />
        {editing ? <>
          <h3 ref={editorHeading} tabIndex={-1} className="text-lg font-semibold">แก้ไขเป้าหมายน้ำหนัก</h3>
          <PersonalWeightGoalEditor key={`${goal.id}:${goal.updatedAt}`} goal={goal} nonce={nonce} coordination={reviewCoordination} />
          <Button type="button" variant="ghost" disabled={saving || pending || lockedForReview} onClick={() => { setEditing(false); setFeedback({ status: "IDLE" }); }}>ยกเลิกการแก้ไข</Button>
        </> : confirmingRemove ? <>
          <h3 className="text-lg font-semibold">ยืนยันการลบเป้าหมาย</h3>
          <PersonalWeightGoalRemoveConfirmation
            goal={goal}
            coordination={reviewCoordination}
            onCancel={() => { restoreRemoveFocus.current = true; setConfirmingRemove(false); }}
          />
        </> : <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={saving || pending} onClick={() => { setFeedback({ status: "IDLE" }); setEditing(true); }}>แก้ไข</Button>
          <Button ref={removeOpener} variant="danger" disabled={saving || pending} onClick={() => setConfirmingRemove(true)}>ลบเป้าหมาย</Button>
        </div>}
      </div>
    </Panel> : creating ? <Panel>
      <div className="space-y-4">
        <h3 ref={editorHeading} tabIndex={-1} className="text-lg font-semibold">ตั้งเป้าหมายน้ำหนัก</h3>
        <p className="text-text-muted">เป้าหมายส่วนตัวที่คุณตั้งไว้</p>
        <PersonalWeightGoalEditor key={nonce} nonce={nonce} coordination={coordination} />
        <Button type="button" variant="ghost" disabled={saving || pending || feedback.status === "UNCONFIRMED"} onClick={() => { setCreating(false); setFeedback({ status: "IDLE" }); }}>ยกเลิก</Button>
      </div>
    </Panel> : <div className="space-y-3">
      <p className="text-text-muted">ยังไม่ได้ตั้งเป้าหมายน้ำหนักส่วนตัว</p>
      <Button disabled={saving || pending} onClick={startCreate}>ตั้งเป้าหมายน้ำหนัก</Button>
    </div>}

    {lockedForReview ? <Button variant="secondary" loading={pending} disabled={saving} onClick={refresh}>โหลดข้อมูลล่าสุด</Button> : null}
  </div>;
}
