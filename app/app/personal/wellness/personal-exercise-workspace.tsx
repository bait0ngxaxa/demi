"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRetainedDraft } from "@/components/ui/use-retained-draft";
import type { PersonalExerciseDto, PersonalExercisePage } from "@/modules/exercises/domain/personal-exercise";
import type { ExerciseActionState } from "@/modules/exercises/transport/action-state";
import { listPersonalExercisesAction } from "@/modules/exercises/transport/server-actions";
import { ExerciseEditor, ExerciseDeleteForm, type ExerciseDraft } from "./personal-exercise-controls";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";
import { SavedRecordActions, SavedRecordCard, SavedRecordEmpty } from "../saved-record-card";

export function ExerciseReadback({ item, titleAs: Title = "p" }: { item: PersonalExerciseDto; titleAs?: "p" | "h4" }): React.JSX.Element {
  // Display the civil truth directly; never format a carrier instant in browser TZ.
  return <div className="min-w-0 space-y-1">
    <Title className="whitespace-pre-wrap break-words text-base font-semibold text-text">{item.activityName}</Title>
    <p className="text-sm text-text-muted">วันที่ออกกำลังกาย <time className="tabular-nums" dateTime={item.occurredOn}>{item.occurredOn}</time></p>
    <p className={item.durationMinutes === null ? "pt-2 text-text-muted" : "pt-2 text-lg font-semibold tabular-nums text-text"}>{item.durationMinutes === null ? "ไม่ได้บันทึกระยะเวลา" : `${item.durationMinutes.toLocaleString("th-TH")} นาที`}</p>
    <p className={`max-w-prose whitespace-pre-wrap break-words leading-relaxed ${item.note ? "text-text" : "text-text-muted"}`}>{item.note ?? "ไม่ได้บันทึกเพิ่มเติม"}</p>
  </div>;
}
export function PersonalExerciseWorkspace({ initialPage, today, maxDate, initialNonce, authority, date, onSummary, onLockChange }: { initialPage: PersonalExercisePage; today: string; maxDate?: string; initialNonce: string; authority: WellnessPrivateAuthority; date?: string; onSummary?: (summary: PersonalExercisePage["dailySummary"]) => void; onLockChange?: (locked: boolean) => void }): React.JSX.Element {
  const [page, setPage] = useState(initialPage);
  const [dailySummary, setDailySummary] = useState(initialPage.dailySummary);
  // The selected entry is the subject of the open edit or delete dialog; results then belong to it, not to create.
  const [selected, setSelected] = useState<PersonalExerciseDto | undefined>();
  const [mode, setMode] = useState<"EDIT" | "DELETE">("EDIT");
  const [nonce, setNonce] = useState(initialNonce);
  const [feedback, setFeedback] = useState<ExerciseActionState>({ status: "IDLE" });
  const [blocked, setBlocked] = useState(false);
  // Read completion may release only its own activity, never an unresolved write.
  const activity = useRef<{ readPending: boolean; write: "IDLE" | "WRITE_PENDING" | "UNRESOLVED_CREATE" | "REVIEW_REQUIRED" | "CONFIRMED"; confirmedCreate: boolean }>({ readPending: false, write: "IDLE", confirmedCreate: false });
  const [readError, setReadError] = useState("");
  function publishLock(): void {
    onLockChange?.(activity.current.readPending || ["WRITE_PENDING", "UNRESOLVED_CREATE", "REVIEW_REQUIRED"].includes(activity.current.write));
  }
  const [recoveringCreate, setRecoveringCreate] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const generation = useRef(0);
  const active = useRef(true);
  const releaseLock = useRef(onLockChange);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const entryTrigger = useRef<HTMLButtonElement | null>(null);
  const entryRemoved = useRef(false);
  const editDraft = useRetainedDraft<ExerciseDraft>();
  useEffect(() => {
    active.current = true;
    const release = releaseLock.current;
    return () => { active.current = false; generation.current += 1; release?.(false); };
  }, []);
  function clearPrivateState(): void {
    active.current = false;
    generation.current += 1;
    setPage({ items: [], nextCursor: null });
    setDailySummary(undefined);
    setSelected(undefined);
    setNonce("");
    setFeedback({ status: "IDLE" });
    setBlocked(true);
    editDraft.clear();
  }
  function refresh(append = false, afterMutation = false): void {
    const captured = ++generation.current;
    activity.current.readPending = true;
    publishLock();
    setReadError("");
    onSummary?.(undefined);
    setDailySummary(undefined);
    const authorityGeneration = authority.captureGeneration();
    startTransition(async () => {
      const form = new FormData();
      if (date) form.set("occurredOn", date);
      if (append && page.nextCursor) form.set("cursor", page.nextCursor);
      let result: ExerciseActionState;
      try { result = await listPersonalExercisesAction(form); }
      catch { result = { status: "ERROR", message: "ยังโหลดรายการไม่ได้ กรุณาลองใหม่" }; }
      if (!active.current || captured !== generation.current || !authority.isCurrent(authorityGeneration)) return;
      activity.current.readPending = false;
      publishLock();
      if (result.status === "DENIED") { authority.invalidate(); clearPrivateState(); return; }
      if (result.page) {
        const next = result.page;
        setPage((current) => ({ items: append ? [...new Map([...current.items, ...next.items].map((item) => [item.id, item])).values()] : next.items, nextCursor: next.nextCursor, dailySummary: next.dailySummary }));
        onSummary?.(next.dailySummary);
        setDailySummary(next.dailySummary);
        // Only a confirmed create renews the create intent; an entry edit or delete leaves the create draft alone.
        const renewCreateIntent = afterMutation && activity.current.confirmedCreate;
        if (renewCreateIntent) editorHeading.current?.focus();
        if (!append && activity.current.write !== "UNRESOLVED_CREATE" && activity.current.write !== "WRITE_PENDING") {
          const confirmed = activity.current.write === "CONFIRMED";
          const confirmedCreate = confirmed && activity.current.confirmedCreate;
          activity.current.write = "IDLE";
          activity.current.confirmedCreate = false;
          publishLock();
          setSelected(undefined); setBlocked(false); setReviewRequired(false);
          if (!confirmed && !afterMutation) setFeedback({ status: "IDLE" });
          if (confirmedCreate || renewCreateIntent) setNonce(crypto.randomUUID());
        }
      } else {
        setReadError("ยังโหลดรายการและข้อมูลสรุปล่าสุดไม่ได้ กรุณาโหลดรายการล่าสุดอีกครั้ง");
      }
    });
  }
  function onResult(state: ExerciseActionState): void {
    if (!active.current || !authority.isActive()) return;
    if (state.status === "DENIED") { authority.invalidate(); clearPrivateState(); return; }
    setFeedback(state);
    const unresolved = !selected && !state.result && state.status !== "CREATE_CONSUMED" && (recoveringCreate || state.status === "UNCONFIRMED" || state.status === "CONFLICT");
    activity.current.write = state.result ? "CONFIRMED" : unresolved ? "UNRESOLVED_CREATE" : selected && (state.status === "CONFLICT" || state.status === "UNCONFIRMED") ? "REVIEW_REQUIRED" : "IDLE";
    if (state.result) activity.current.confirmedCreate = !selected;
    setRecoveringCreate(unresolved);
    setReviewRequired(activity.current.write === "REVIEW_REQUIRED");
    publishLock();
    if (state.result) {
      setBlocked(true);
      editDraft.clear();
      const result = state.result;
      if (result.outcome === "DELETED") { entryRemoved.current = true; setPage((current) => ({ ...current, items: current.items.filter((item) => item.id !== result.entryId) })); setSelected(undefined); }
      else setPage((current) => ({ ...current, items: [result.item, ...current.items.filter((item) => item.id !== result.item.id)].filter((item) => !date || item.occurredOn === date)
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)) }));
      if (date) { onSummary?.(undefined); refresh(false, true); }
    } else if (selected && (state.status === "CONFLICT" || state.status === "UNCONFIRMED")) setBlocked(true);
  }
  const coordination = { authority, isActive: () => active.current && authority.isActive(), blocked: blocked || saving || pending, onResult, onSubmitting: () => { if (active.current && authority.isActive()) setSaving(true); }, onPending: (value: boolean) => { if (active.current && authority.isActive()) {
    setSaving(value);
    if (value) { generation.current += 1; activity.current.readPending = false; activity.current.write = "WRITE_PENDING"; }
    // onResult performs the terminal transition; false alone cannot resolve a write.
    publishLock();
  } } };
  const intentLocked = (): boolean => activity.current.write === "UNRESOLVED_CREATE" || activity.current.write === "WRITE_PENDING" || activity.current.write === "REVIEW_REQUIRED";
  function openEntry(item: PersonalExerciseDto, nextMode: "EDIT" | "DELETE", trigger: HTMLButtonElement): void {
    if (intentLocked()) return;
    activity.current.write = "IDLE";
    publishLock();
    entryTrigger.current = trigger;
    entryRemoved.current = false;
    setMode(nextMode); setSelected(item); setBlocked(false); setFeedback({ status: "IDLE" });
  }
  // A running request or an outcome that needs review keeps the dialog open; its recovery is inside it.
  const entryDialogDismissible = !saving && !pending && !reviewRequired;
  function closeEntry(): void {
    if (!selected || !entryDialogDismissible) return;
    if (mode === "EDIT" && activity.current.write !== "CONFIRMED") editDraft.retain(`${selected.id}:${selected.updatedAt}`);
    setSelected(undefined);
  }
  function entryReturnFocus(): HTMLElement | null {
    const trigger = entryTrigger.current;
    return !entryRemoved.current && trigger?.isConnected && !trigger.disabled ? trigger : historyHeading.current;
  }
  return <div className="space-y-6">
    <header className="space-y-1.5">
      <h2 className="text-2xl font-semibold">การออกกำลังกาย</h2>
      {date ? <p className="text-sm font-medium text-brand-strong">บันทึกประจำวันที่ <time dateTime={date}>{date}</time></p> : null}
      <p className="max-w-prose text-text-muted">เลือกกิจกรรมที่คุณทำจริง หรือกรอกเอง</p>
    </header>
    {reviewRequired ? <Alert variant="warning">กรุณาโหลดรายการล่าสุดเพื่อทบทวนผลคำขอเดิม ก่อนเริ่มบันทึกใหม่หรือเลือกรายการอื่น</Alert> : null}
    {readError ? <Alert variant="warning">{readError}</Alert> : null}
    {feedback.message ? <div role="status"><Alert variant={feedback.status === "SUCCESS" ? "success" : "danger"}>{feedback.message}</Alert></div> : null}
    {/* Only a server-returned item reaches this readback; a pending or unconfirmed create stays in the form. */}
    {feedback.result && "item" in feedback.result ? <section aria-label="ข้อมูลที่บันทึกแล้ว"><SavedRecordCard>
      <div className="mb-3"><StatusBadge variant="success">บันทึกแล้ว</StatusBadge></div>
      <ExerciseReadback item={feedback.result.item} />
    </SavedRecordCard></section> : null}
    <Panel><div className="space-y-4">
      <div className="space-y-1"><h3 ref={editorHeading} tabIndex={-1} className="text-xl font-semibold">บันทึกการออกกำลังกาย</h3>
        <p className="text-sm text-text-muted">ข้อมูลในแบบฟอร์มนี้จะถูกบันทึกเมื่อคุณกดปุ่มบันทึกเท่านั้น</p></div>
      <ExerciseEditor key={nonce} today={today} maxDate={maxDate} nonce={nonce} coordination={coordination} />
      <Button className="w-full sm:w-auto" variant="ghost" disabled={saving || pending || recoveringCreate || reviewRequired} onClick={() => { if (intentLocked()) return; setSelected(undefined); setBlocked(false); setFeedback({ status: "IDLE" }); activity.current.write = "IDLE"; publishLock(); setNonce(crypto.randomUUID()); }}>เริ่มบันทึกใหม่</Button>
    </div></Panel>
    <section id="exercise-history" aria-label="ประวัติการออกกำลังกาย" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 ref={historyHeading} tabIndex={-1} className="text-xl font-semibold">กิจกรรมที่บันทึกแล้ว</h3>
        <Button variant="secondary" size="compact" disabled={saving || pending} onClick={() => refresh()}>โหลดรายการล่าสุด</Button>
      </div>
      {/* The confirmed server total for the day, kept apart from both the form draft and the individual records. */}
      <div aria-label="สรุปกิจกรรมที่บันทึกแล้ว" className="rounded-control bg-surface-muted px-4 py-3">
        <p role="status" className="text-sm text-text-muted"><span className="font-medium text-text">สรุปของวัน</span> · {dailySummary ? dailySummary.count === 0 ? "ยังไม่มีบันทึกการออกกำลังกาย" : `${dailySummary.count.toLocaleString("th-TH")} รายการ · ${dailySummary.durationMinutes === null ? "ไม่ได้บันทึกระยะเวลา" : `รวมเฉพาะเวลาที่ระบุ ${dailySummary.durationMinutes.toLocaleString("th-TH")} นาที`}` : "ข้อมูลสรุปล่าสุดยังไม่พร้อม"}</p>
      </div>
      {!page.items.length ? <SavedRecordEmpty>ยังไม่มีบันทึกการออกกำลังกาย{date ? <> ในวันที่ <time className="tabular-nums" dateTime={date}>{date}</time></> : null}</SavedRecordEmpty> : <ul aria-label="รายการกิจกรรมที่บันทึกแล้ว" className="space-y-3">{page.items.map((item) => {
        const context = `${item.activityName} วันที่ ${item.occurredOn}`;
        const disabled = saving || pending || recoveringCreate || reviewRequired;
        return <SavedRecordCard as="li" key={item.id}><ExerciseReadback item={item} titleAs="h4" />
          <SavedRecordActions>
            <Button variant="secondary" aria-label={`แก้ไข ${context}`} disabled={disabled} onClick={(event) => openEntry(item, "EDIT", event.currentTarget)}>แก้ไข</Button>
            <Button variant="ghost" aria-label={`ลบ ${context}`} disabled={disabled} onClick={(event) => openEntry(item, "DELETE", event.currentTarget)}>ลบ</Button>
          </SavedRecordActions>
        </SavedRecordCard>;
      })}</ul>}
      {page.nextCursor ? <Button variant="secondary" loading={pending} disabled={saving} onClick={() => refresh(true)}>ดูรายการก่อนหน้า</Button> : null}
      {pending ? <p role="status">กำลังโหลดรายการ...</p> : null}
    </section>
    {selected ? <ModalDialog
      description={<><span className="break-words">{selected.activityName}</span> · บันทึกวันที่ <time dateTime={selected.occurredOn}>{selected.occurredOn}</time></>}
      dismissible={entryDialogDismissible}
      onRequestClose={closeEntry}
      returnFocusTarget={entryReturnFocus}
      size={mode === "EDIT" ? "fullscreen" : "compact"}
      title={mode === "EDIT" ? "แก้ไขบันทึกการออกกำลังกาย" : "ลบบันทึกการออกกำลังกาย"}
    >
      <div className="space-y-4">
        {reviewRequired ? <Alert variant="warning">
          <p>กรุณาโหลดรายการล่าสุดเพื่อทบทวนผลคำขอเดิม ก่อนเริ่มบันทึกใหม่หรือเลือกรายการอื่น</p>
          <Button className="mt-3" size="compact" variant="secondary" loading={pending} disabled={saving} onClick={() => refresh()}>โหลดรายการล่าสุด</Button>
        </Alert> : null}
        {mode === "EDIT"
          ? <ExerciseEditor key={`${selected.id}:${selected.updatedAt}`} item={selected} today={today} maxDate={maxDate} nonce={nonce} coordination={coordination} initialDraft={editDraft.retained(`${selected.id}:${selected.updatedAt}`)} draftRef={editDraft.draftRef} onCancel={closeEntry} />
          : <><ExerciseReadback item={selected} /><ExerciseDeleteForm key={`${selected.id}:${selected.updatedAt}:delete`} item={selected} coordination={coordination} onCancel={closeEntry} /></>}
      </div>
    </ModalDialog> : null}
  </div>;
}
