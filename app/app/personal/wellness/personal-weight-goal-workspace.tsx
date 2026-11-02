"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { Panel } from "@/components/ui/panel";
import { useRetainedDraft } from "@/components/ui/use-retained-draft";
import type { PersonalWeightGoalDto } from "@/modules/weight-goals/domain/personal-weight-goal";
import type { PersonalWeightGoalActionState } from "@/modules/weight-goals/transport/action-state";
import { readPersonalWeightGoalAction } from "@/modules/weight-goals/transport/server-actions";
import { PersonalWeightGoalEditor, PersonalWeightGoalRemoveConfirmation, type Coordination, type WeightGoalDraft } from "./personal-weight-goal-controls";
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
  onLockChange,
}: {
  initialGoal: PersonalWeightGoalDto | null;
  initialNonce: string;
  authority: WellnessPrivateAuthority;
  onLockChange?: (locked: boolean) => void;
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
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const editOpener = useRef<HTMLButtonElement>(null);
  const removeOpener = useRef<HTMLButtonElement>(null);
  const editDraft = useRetainedDraft<WeightGoalDraft>();

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      requestGeneration.current += 1;
    };
  }, []);
  // Editing and removal are dialogs that manage their own focus; only inline creation moves focus here.
  useEffect(() => {
    if (creating) editorHeading.current?.focus();
  }, [creating]);

  function clearPrivateState(): void {
    active.current = false;
    requestGeneration.current += 1;
    setGoal(null);
    setNonce("");
    setCreating(false);
    setEditing(false);
    setConfirmingRemove(false);
    setRequiresCurrentGoalReview(false);
    setFeedback({ status: "IDLE" });
    editDraft.clear();
  }

  function onResult(state: PersonalWeightGoalActionState): void {
    if (!active.current || !authority.isActive()) return;
    if (state.status === "DENIED") {
      authority.invalidate();
      clearPrivateState();
      return;
    }
    setFeedback(state);
    onLockChange?.(state.status === "UNCONFIRMED" || state.status === "CONFLICT" || state.status === "CREATE_CONSUMED");
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
    editDraft.clear();
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
        onLockChange?.(false);
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
      onLockChange?.(value);
  };
  const onSubmitting = (): void => {
    if (active.current && authority.isActive()) setSaving(true);
  };
  const coordination: Coordination = { authority, isActive, blocked: saving || pending, onResult, onPending, onSubmitting };
  const reviewCoordination: Coordination = {
    authority,
    isActive,
    blocked: saving || pending || lockedForReview,
    onResult,
    onPending,
    onSubmitting,
  };
  // A running request or an outcome that needs the current goal reviewed keeps the dialog open.
  const goalDialogDismissible = !saving && !pending && !lockedForReview;

  function closeEdit(): void {
    if (!goalDialogDismissible) return;
    if (goal) editDraft.retain(`${goal.id}:${goal.updatedAt}`);
    setEditing(false);
    setFeedback({ status: "IDLE" });
  }

  function closeRemove(): void {
    if (!goalDialogDismissible) return;
    setConfirmingRemove(false);
  }

  function goalReturnFocus(opener: HTMLButtonElement | null): HTMLElement | null {
    return opener?.isConnected && !opener.disabled ? opener : sectionHeading.current;
  }

  const reviewReload = lockedForReview ? <Alert variant="warning">
    <p>โหลดข้อมูลล่าสุดเพื่อทบทวนเป้าหมายปัจจุบันก่อนดำเนินการต่อ</p>
    <Button className="mt-3" size="compact" variant="secondary" loading={pending} disabled={saving} onClick={refresh}>โหลดข้อมูลล่าสุด</Button>
  </Alert> : null;

  return <div className="space-y-5">
    <h2 ref={sectionHeading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline-none">เป้าหมายน้ำหนัก</h2>
    {!editorOpen && feedback.message ? <div role="status" aria-live="polite"><Alert variant={feedback.status === "SUCCESS" ? "success" : "danger"}>{feedback.message}</Alert></div> : null}

    {requiresCurrentGoalReview ? <div className="space-y-3">
      <p className="text-text-muted">โหลดข้อมูลล่าสุดเพื่อทบทวนเป้าหมายปัจจุบันก่อนเริ่มคำขอใหม่</p>
      <Button variant="secondary" loading={pending} disabled={saving} onClick={refresh}>โหลดข้อมูลล่าสุด</Button>
    </div> : goal ? <Panel>
      <div className="space-y-4">
        <PersonalWeightGoalReadback goal={goal} />
        <div className="flex flex-wrap gap-2">
          <Button ref={editOpener} variant="secondary" disabled={saving || pending} onClick={() => { setFeedback({ status: "IDLE" }); setEditing(true); }}>แก้ไข</Button>
          <Button ref={removeOpener} variant="danger" disabled={saving || pending} onClick={() => { setFeedback({ status: "IDLE" }); setConfirmingRemove(true); }}>ลบเป้าหมาย</Button>
        </div>
      </div>
      {editing ? <ModalDialog
        description="แก้ไขเป้าหมายส่วนตัวที่คุณตั้งไว้ วันที่เป้าหมายเดิมจะคงอยู่จนกว่าคุณจะเลือกเปลี่ยน"
        dismissible={goalDialogDismissible}
        onRequestClose={closeEdit}
        returnFocusTarget={() => goalReturnFocus(editOpener.current)}
        size="fullscreen"
        title="แก้ไขเป้าหมายน้ำหนัก"
      >
        <div className="space-y-4">
          {reviewReload}
          <PersonalWeightGoalEditor key={`${goal.id}:${goal.updatedAt}`} goal={goal} nonce={nonce} coordination={reviewCoordination} initialDraft={editDraft.retained(`${goal.id}:${goal.updatedAt}`)} draftRef={editDraft.draftRef} />
          <Button type="button" variant="ghost" disabled={!goalDialogDismissible} onClick={closeEdit}>ยกเลิกการแก้ไข</Button>
        </div>
      </ModalDialog> : null}
      {confirmingRemove ? <ModalDialog
        dismissible={goalDialogDismissible}
        onRequestClose={closeRemove}
        returnFocusTarget={() => goalReturnFocus(removeOpener.current)}
        size="compact"
        title="ยืนยันการลบเป้าหมาย"
      >
        <div className="space-y-4">
          <PersonalWeightGoalReadback goal={goal} />
          {reviewReload}
          <PersonalWeightGoalRemoveConfirmation goal={goal} coordination={reviewCoordination} onCancel={closeRemove} />
        </div>
      </ModalDialog> : null}
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

    {lockedForReview && !editorOpen ? <Button variant="secondary" loading={pending} disabled={saving} onClick={refresh}>โหลดข้อมูลล่าสุด</Button> : null}
  </div>;
}
