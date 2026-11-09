"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { useRetainedDraft } from "@/components/ui/use-retained-draft";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { SavedRecordActions, SavedRecordCard, SavedRecordEmpty } from "../saved-record-card";
import type { PersonalMedicationDetailDto, PersonalMedicationDto, PersonalMedicationPage } from "@/modules/medications/domain/personal-medication-definitions";
import type { PersonalMedicationActionState } from "@/modules/medications/transport/action-state";
import type { OwnMedicationLineReminderPreference } from "@/modules/medications/services/medication-line-reminder-preference-service";
import {
  MedicationEditor,
  MedicationStopForm,
  MedicationScheduleEditor,
  MedicationFeedback,
  type MedicationScheduleDraft,
  type MedicationTextDraft,
  type MutationCoordination,
} from "./personal-medication-controls";

type MedicationDialog = "TEXT" | "SCHEDULE" | null;

/** Return focus to the dialog trigger, or to the detail heading once the trigger is gone or locked. */
function focusReturnTarget(trigger: HTMLButtonElement | null): HTMLElement | null {
  return trigger?.isConnected && !trigger.disabled ? trigger : document.getElementById("medication-detail-heading");
}

const TRACKING_LABEL = { ACTIVE: "กำลังติดตาม", STOPPED: "หยุดติดตามแล้ว" } as const;

/** Tracking status in DEMI only; it never describes whether the medicine is actually taken. */
function TrackingBadge({ status }: { status: "ACTIVE" | "STOPPED" }): React.JSX.Element {
  return <StatusBadge variant={status === "ACTIVE" ? "success" : "neutral"}>{TRACKING_LABEL[status]}</StatusBadge>;
}

/** Saved daily HH:mm values exactly as recorded (Asia/Bangkok); wraps and scrolls vertically, never horizontally. */
function RecordedTimes({ times, label }: { times: { localTime: string }[]; label: string }): React.JSX.Element {
  if (times.length === 0) return <p className="text-text-muted">ยังไม่ได้บันทึกเวลา</p>;
  return <ul aria-label={label} tabIndex={times.length > 24 ? 0 : undefined} className="flex max-h-96 flex-wrap gap-2 overflow-y-auto rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">
    {times.map(({ localTime }) => <li key={localTime} className="rounded-control border border-border bg-surface-muted px-3 py-1.5 text-base font-semibold tabular-nums text-text"><time dateTime={localTime}>{localTime}</time></li>)}
  </ul>;
}

/** Recorded name and patient-entered text, read-only. */
function RecordedMedicationText({ item }: { item: PersonalMedicationDto }): React.JSX.Element {
  return <dl className="space-y-3">
    <div><dt className="text-sm text-text-muted">ชื่อยา</dt><dd className="mt-0.5 break-words font-semibold text-text">{item.medicationName}</dd></div>
    <div><dt className="text-sm text-text-muted">ข้อความประกอบที่คุณบันทึก</dt>
      <dd className={`mt-0.5 max-w-prose whitespace-pre-wrap break-words leading-relaxed ${item.instructionText ? "text-text" : "text-text-muted"}`}>{item.instructionText ?? "ไม่ได้บันทึกข้อความประกอบ"}</dd></div>
  </dl>;
}

function needsAttention(state: PersonalMedicationActionState): boolean {
  return state.status === "CONFLICT" || Boolean(state.refreshRequired) || Boolean(state.loginHref);
}

/**
 * Owns mutation authority for the selected ACTIVE medication: one `blocked` flag locks text edit,
 * schedule edit and stop together, and an open dialog cannot be dismissed while its request runs.
 * Fresh detail after a confirmed change remounts this component (key includes `updatedAt`).
 */
function SelectedMedicationForms({ item, onFeedback }: { item: PersonalMedicationDetailDto; onFeedback: (state: PersonalMedicationActionState) => void }): React.JSX.Element {
  const [blocked, setBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialog, setDialog] = useState<MedicationDialog>(null);
  // A result that still needs the user's attention stays on the page after its dialog closes.
  const [notice, setNotice] = useState<PersonalMedicationActionState | null>(null);
  const textDraft = useRetainedDraft<MedicationTextDraft>();
  const scheduleDraft = useRetainedDraft<MedicationScheduleDraft>();
  const textTrigger = useRef<HTMLButtonElement>(null);
  const scheduleTrigger = useRef<HTMLButtonElement>(null);
  const draftKey = `${item.id}:${item.updatedAt}`;
  const onSubmit = useCallback(() => { setBlocked(true); setSubmitting(true); }, []);
  const onResult = useCallback((state: PersonalMedicationActionState) => {
    setSubmitting(false);
    setBlocked(state.status === "SUCCESS" || state.status === "CONFLICT" || Boolean(state.refreshRequired));
    if (state.status === "SUCCESS") onFeedback(state);
  }, [onFeedback]);
  const coordination: MutationCoordination = { blocked, onSubmit, onResult };
  const { clear: clearTextDraft } = textDraft;
  const { clear: clearScheduleDraft } = scheduleDraft;
  const onDialogResult = useCallback((state: PersonalMedicationActionState) => {
    onResult(state);
    if (state.status === "SUCCESS") {
      clearTextDraft();
      clearScheduleDraft();
      setNotice(null);
      setDialog(null);
    } else {
      setNotice(needsAttention(state) ? state : null);
    }
  }, [clearScheduleDraft, clearTextDraft, onResult]);
  const dialogCoordination: MutationCoordination = { blocked, onSubmit, onResult: onDialogResult };

  function openDialog(next: Exclude<MedicationDialog, null>): void {
    if (blocked || submitting) return;
    setNotice(null);
    setDialog(next);
  }

  function closeDialog(): void {
    if (submitting) return;
    if (dialog === "TEXT") textDraft.retain(draftKey);
    if (dialog === "SCHEDULE") scheduleDraft.retain(draftKey);
    setDialog(null);
  }

  return <>
    <section aria-labelledby="medication-text-heading" className="space-y-3 border-t border-border pt-5">
      <h3 id="medication-text-heading" className="text-lg font-semibold">ข้อมูลที่บันทึกไว้</h3>
      <RecordedMedicationText item={item} />
      <Button ref={textTrigger} variant="secondary" disabled={blocked} onClick={() => openDialog("TEXT")}>แก้ไขชื่อยาและข้อความประกอบ</Button>
    </section>
    <section aria-labelledby="medication-schedule-heading" className="space-y-3 border-t border-border pt-5">
      <div className="space-y-1"><h3 id="medication-schedule-heading" className="text-lg font-semibold">เวลาที่ต้องการติดตามใน DEMI</h3>
        <p className="text-sm text-text-muted">เวลารายวันตามเวลา Asia/Bangkok ที่คุณบันทึกเอง</p></div>
      <RecordedTimes times={item.schedules} label="เวลาที่บันทึกไว้" />
      <Button ref={scheduleTrigger} variant="secondary" disabled={blocked} onClick={() => openDialog("SCHEDULE")}>แก้ไขเวลา</Button>
    </section>
    {notice && dialog === null ? <div role="status"><MedicationFeedback state={notice} /></div> : null}
    <section aria-labelledby="medication-tracking-heading" className="space-y-1 border-t border-border pt-5">
      <h3 id="medication-tracking-heading" className="text-lg font-semibold">การติดตามใน DEMI</h3>
      <p className="pb-2 text-sm text-text-muted">หยุดติดตามเมื่อไม่ต้องการติดตามรายการนี้ใน DEMI แล้ว ไม่เปลี่ยนการใช้ยาของคุณ และรายการจะอยู่ในประวัติ</p>
      <MedicationStopForm item={item} coordination={coordination} />
    </section>
    {dialog === "TEXT" ? <ModalDialog
      description={<span className="break-words">{item.medicationName}</span>}
      dismissible={!submitting}
      onRequestClose={closeDialog}
      returnFocusTarget={() => focusReturnTarget(textTrigger.current)}
      title="แก้ไขชื่อยาและข้อความประกอบ"
    >
      <MedicationEditor item={item} coordination={dialogCoordination} initialDraft={textDraft.retained(draftKey)} draftRef={textDraft.draftRef} onCancel={closeDialog} />
    </ModalDialog> : null}
    {dialog === "SCHEDULE" ? <ModalDialog
      description={<span className="break-words">{item.medicationName}</span>}
      dismissible={!submitting}
      onRequestClose={closeDialog}
      returnFocusTarget={() => focusReturnTarget(scheduleTrigger.current)}
      size="fullscreen"
      title="แก้ไขเวลาที่ต้องการติดตามใน DEMI"
    >
      <MedicationScheduleEditor item={item} coordination={dialogCoordination} initialDraft={scheduleDraft.retained(draftKey)} draftRef={scheduleDraft.draftRef} onCancel={closeDialog} />
    </ModalDialog> : null}
  </>;
}

function MedicationList({ page, status, selectedId }: { page: PersonalMedicationPage; status: "ACTIVE" | "STOPPED"; selectedId?: string }): React.JSX.Element {
  const label = TRACKING_LABEL[status];
  const cursorParam = status === "ACTIVE" ? "activeCursor" : "stoppedCursor";
  return <section aria-label={label} className="space-y-4">
    <h2 className="text-xl font-semibold text-text">{label}</h2>
    {page.items.length === 0 ? <SavedRecordEmpty>{status === "ACTIVE" ? "ยังไม่มีรายการที่กำลังติดตาม" : "ยังไม่มีประวัติหยุดติดตาม"}</SavedRecordEmpty> :
      <ul aria-label={`รายการยา${label}`} className="space-y-3">{page.items.map((item) => {
        const selected = item.id === selectedId;
        const recordedOn = new Date(status === "ACTIVE" ? item.createdAt : item.stoppedAt ?? item.updatedAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
        // Stopped records are history: flat and muted, never styled like the ACTIVE list.
        return <SavedRecordCard as="li" key={item.id} className={`${status === "STOPPED" ? "bg-surface-muted shadow-none" : ""} ${selected ? "border-brand" : ""}`}>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <h3 className="min-w-0 break-words text-base font-semibold text-text">{item.medicationName}</h3>
            <TrackingBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-text-muted">{status === "ACTIVE" ? "เพิ่มรายการเมื่อ" : "หยุดติดตามเมื่อ"} {recordedOn}</p>
          {item.instructionText ? <p className="mt-3 line-clamp-3 max-w-prose whitespace-pre-wrap break-words leading-relaxed text-text">{item.instructionText}</p> : null}
          <SavedRecordActions>
            <Link className={buttonClassName({ variant: "secondary" })} aria-current={selected ? "true" : undefined} aria-label={`ดูรายละเอียด ${item.medicationName}`} href={`?item=${item.id}#medication-detail`}>{selected ? "กำลังแสดงรายละเอียด" : "ดูรายละเอียด"}</Link>
          </SavedRecordActions>
        </SavedRecordCard>;
      })}</ul>}
    {page.nextCursor ? <Link className={buttonClassName({ variant: "secondary" })} href={`?${cursorParam}=${page.nextCursor}`}>ดูรายการก่อนหน้า · {label}</Link> : null}
  </section>;
}

/**
 * Create entry behind an explicit disclosure. The form stays mounted while collapsed, so a draft,
 * a pending request or an unconfirmed result is never discarded by closing it.
 */
function MedicationCreateDisclosure({ initiallyOpen }: { initiallyOpen: boolean }): React.JSX.Element {
  return <section aria-labelledby="medication-create-heading">
    <details open={initiallyOpen} className="group rounded-panel border border-border bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-panel px-5 py-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring sm:px-7 [&::-webkit-details-marker]:hidden">
        <span className="space-y-0.5"><span id="medication-create-heading" className="block text-lg font-semibold text-brand-strong">เพิ่มรายการยา</span>
          <span className="block text-sm text-text-muted">กรอกชื่อยา ข้อความประกอบ และเวลาที่ต้องการติดตาม</span></span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0 text-brand-strong transition-transform group-open:rotate-180 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 5 5 5-5" /></svg>
      </summary>
      <div className="space-y-4 border-t border-border px-5 pb-5 pt-5 sm:px-7 sm:pb-7">
        <p className="text-sm text-text-muted">รายการจะถูกบันทึกเมื่อคุณกดปุ่มเพิ่มรายการเท่านั้น</p>
        <MedicationEditor />
      </div>
    </details>
  </section>;
}

/** Read-only readback of the LINE reminder preference; changes stay in Settings. */
function MedicationReminderStatus({ reminder }: { reminder: OwnMedicationLineReminderPreference }): React.JSX.Element {
  return <section aria-labelledby="medication-reminder-status-heading" className="space-y-2 rounded-panel border border-border bg-surface px-5 py-4">
    <h2 id="medication-reminder-status-heading" className="text-base font-semibold text-text">การแจ้งเตือนยาทาง LINE: {reminder.enabled ? "เปิด" : "ปิด"}</h2>
    {!reminder.enabled && !reminder.canEnable ? <p className="text-sm text-text-muted">เชื่อมบัญชี LINE ก่อนจึงจะเปิดการแจ้งเตือนได้</p> : null}
    <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href="/app/settings">ตั้งค่าการแจ้งเตือนยา</Link>
  </section>;
}

export function PersonalMedicationWorkspace({ active, stopped, selected, safeError, reminder = null }: {
  active: PersonalMedicationPage; stopped: PersonalMedicationPage; selected: PersonalMedicationDetailDto | null; safeError?: string;
  reminder?: OwnMedicationLineReminderPreference | null;
}): React.JSX.Element {
  const [feedback, setFeedback] = useState<PersonalMedicationActionState>({ status: "IDLE" });
  // Captured once: a refreshed list after a confirmed create must not collapse the form showing its result.
  const [createInitiallyOpen] = useState(active.items.length === 0);
  return <div className="max-w-4xl space-y-6">
    <PageHeader breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "ยาของฉัน" }]} title="ยาของฉัน" description="รายการยาที่คุณบันทึก" />
    <p className="max-w-prose text-text-muted">ใช้ติดตามรายการส่วนตัวใน DEMI ข้อความประกอบเป็นข้อมูลที่คุณกรอก ไม่ใช่คำแนะนำทางการแพทย์จาก DEMI</p>
    {reminder ? <MedicationReminderStatus reminder={reminder} /> : null}
    {safeError ? <Alert variant="danger">{safeError} <Link className="underline" href="/app/personal/medications">โหลดรายการล่าสุด</Link></Alert> : null}
    {selected && feedback.item?.id === selected.id ? <div role="status"><MedicationFeedback state={feedback} /></div> : null}
    {selected ? <section id="medication-detail" aria-labelledby="medication-detail-heading"><Panel><div className="space-y-5">
      <div className="space-y-2">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <h2 id="medication-detail-heading" className="min-w-0 break-words text-xl font-semibold" tabIndex={-1}>{selected.medicationName}</h2>
          <TrackingBadge status={selected.status} />
        </div>
        <p className="text-sm text-text-muted">รายละเอียดรายการยาที่คุณบันทึกไว้ใน DEMI</p>
      </div>
      {selected.status === "ACTIVE" ? <SelectedMedicationForms key={`${selected.id}:${selected.updatedAt}`} item={selected} onFeedback={setFeedback} /> :
        <><section aria-labelledby="medication-text-heading" className="space-y-3 border-t border-border pt-5">
            <h3 id="medication-text-heading" className="text-lg font-semibold">ข้อมูลที่บันทึกไว้</h3>
            <RecordedMedicationText item={selected} />
          </section>
          <section className="space-y-3 border-t border-border pt-5" aria-label="เวลาที่บันทึกไว้ก่อนหยุดติดตามรายการนี้">
            <div className="space-y-1"><h3 className="text-lg font-semibold">เวลาที่บันทึกไว้ก่อนหยุดติดตามรายการนี้</h3>
              <p className="text-sm text-text-muted">เวลารายวันตามเวลา Asia/Bangkok ที่คุณบันทึกเอง</p></div>
            <RecordedTimes times={selected.schedules} label="เวลาที่บันทึกไว้ก่อนหยุดติดตาม" />
          </section>
          <p className="rounded-control bg-surface-muted px-4 py-3 text-sm text-text-muted">รายการนี้หยุดติดตามแล้วและแก้ไขไม่ได้ หากต้องการติดตามอีกครั้ง ให้เพิ่มรายการใหม่</p></>}
      <Link className={buttonClassName({ variant: "ghost" })} href="/app/personal/medications">กลับไปที่รายการ</Link>
    </div></Panel></section> : <MedicationCreateDisclosure initiallyOpen={createInitiallyOpen} />}
    <MedicationList page={active} status="ACTIVE" selectedId={selected?.id} />
    <MedicationList page={stopped} status="STOPPED" selectedId={selected?.id} />
    <Link className={buttonClassName({ variant: "ghost" })} href="/app/personal/medications">รายการล่าสุด</Link>
  </div>;
}
