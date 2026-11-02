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
import type { PersonalMedicationDetailDto, PersonalMedicationPage } from "@/modules/medications/domain/personal-medication-definitions";
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
    <div className="space-y-3">
      <p className="whitespace-pre-wrap break-words">{item.instructionText ?? "ไม่ได้บันทึกข้อความประกอบ"}</p>
      <Button ref={textTrigger} variant="secondary" disabled={blocked} onClick={() => openDialog("TEXT")}>แก้ไขชื่อยาและข้อความประกอบ</Button>
    </div>
    <section aria-labelledby="medication-schedule-heading" className="space-y-3 border-t border-border pt-4">
      <h3 id="medication-schedule-heading" className="text-xl font-semibold">เวลาที่ต้องการติดตามใน DEMI</h3>
      <p className="text-sm text-text-muted">เวลารายวันตามเวลา Asia/Bangkok ที่คุณบันทึกเอง</p>
      {item.schedules.length ? <ul className="space-y-2" aria-label="เวลาที่บันทึกไว้">{item.schedules.map(({ localTime }) => <li key={localTime} className="tabular-nums">{localTime}</li>)}</ul> : <p className="text-text-muted">ยังไม่ได้บันทึกเวลา</p>}
      <Button ref={scheduleTrigger} variant="secondary" disabled={blocked} onClick={() => openDialog("SCHEDULE")}>แก้ไขเวลา</Button>
    </section>
    {notice && dialog === null ? <div role="status"><MedicationFeedback state={notice} /></div> : null}
    <MedicationStopForm item={item} coordination={coordination} />
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

function MedicationList({ page, status }: { page: PersonalMedicationPage; status: "ACTIVE" | "STOPPED" }): React.JSX.Element {
  const label = status === "ACTIVE" ? "กำลังติดตาม" : "หยุดติดตามแล้ว";
  const cursorParam = status === "ACTIVE" ? "activeCursor" : "stoppedCursor";
  return <section aria-label={label} className="space-y-4">
    <h2 className="text-xl font-semibold text-text">{label}</h2>
    {page.items.length === 0 ? <p className="text-text-muted">{status === "ACTIVE" ? "ยังไม่มีรายการที่กำลังติดตาม" : "ยังไม่มีประวัติหยุดติดตาม"}</p> :
      <ul className="divide-y divide-border">{page.items.map((item) => <li key={item.id} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2"><Link className="break-words font-semibold text-brand-strong underline underline-offset-4 focus-visible:ring-4 focus-visible:ring-focus-ring" href={`?item=${item.id}#medication-detail`}>{item.medicationName}</Link>
          <div><StatusBadge variant={status === "ACTIVE" ? "success" : "neutral"}>{label}</StatusBadge></div>
          {item.instructionText ? <p className="whitespace-pre-wrap break-words text-text-muted">{item.instructionText}</p> : null}
        </div>
        <span className="shrink-0 text-sm text-text-muted">{new Date(status === "ACTIVE" ? item.createdAt : item.stoppedAt ?? item.updatedAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}</span>
      </li>)}</ul>}
    {page.nextCursor ? <Link className={buttonClassName({ variant: "secondary" })} href={`?${cursorParam}=${page.nextCursor}`}>ดูรายการก่อนหน้า · {label}</Link> : null}
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
  return <div className="max-w-4xl space-y-6">
    <PageHeader breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "ยาของฉัน" }]} title="ยาของฉัน" description="รายการยาที่คุณบันทึก" />
    <p className="max-w-prose text-text-muted">ใช้ติดตามรายการส่วนตัวใน DEMI ข้อความประกอบเป็นข้อมูลที่คุณกรอก ไม่ใช่คำแนะนำทางการแพทย์จาก DEMI</p>
    {reminder ? <MedicationReminderStatus reminder={reminder} /> : null}
    {safeError ? <Alert variant="danger">{safeError} <Link className="underline" href="/app/personal/medications">โหลดรายการล่าสุด</Link></Alert> : null}
    {selected && feedback.item?.id === selected.id ? <div role="status"><MedicationFeedback state={feedback} /></div> : null}
    {selected ? <section id="medication-detail" aria-labelledby="medication-detail-heading"><Panel><div className="space-y-4">
      <h2 id="medication-detail-heading" className="break-words text-xl font-semibold" tabIndex={-1}>{selected.medicationName}</h2>
      <StatusBadge>{selected.status === "ACTIVE" ? "กำลังติดตาม" : "หยุดติดตามแล้ว"}</StatusBadge>
      {selected.status === "ACTIVE" ? <SelectedMedicationForms key={`${selected.id}:${selected.updatedAt}`} item={selected} onFeedback={setFeedback} /> :
        <><p className="whitespace-pre-wrap break-words">{selected.instructionText ?? "ไม่ได้บันทึกข้อความประกอบ"}</p><p className="text-sm text-text-muted">รายการนี้หยุดติดตามแล้วและแก้ไขไม่ได้ หากต้องการติดตามอีกครั้ง ให้เพิ่มรายการใหม่</p>
          <section className="space-y-3 border-t border-border pt-4" aria-label="เวลาที่บันทึกไว้ก่อนหยุดติดตามรายการนี้">
            <h3 className="text-xl font-semibold">เวลาที่บันทึกไว้ก่อนหยุดติดตามรายการนี้</h3>
            <p className="text-sm text-text-muted">เวลารายวันตามเวลา Asia/Bangkok ที่คุณบันทึกเอง</p>
            {selected.schedules.length ? <ul className="max-h-96 space-y-2 overflow-y-auto">{selected.schedules.map(({ localTime }) => <li key={localTime} className="tabular-nums">{localTime}</li>)}</ul> : <p className="text-text-muted">ยังไม่ได้บันทึกเวลา</p>}
          </section></>}
      <Link className={buttonClassName({ variant: "ghost" })} href="/app/personal/medications">กลับไปที่รายการ</Link>
    </div></Panel></section> : <section aria-labelledby="medication-create-heading"><Panel><h2 id="medication-create-heading" className="mb-4 text-xl font-semibold">เพิ่มรายการยา</h2><MedicationEditor /></Panel></section>}
    <MedicationList page={active} status="ACTIVE" />
    <MedicationList page={stopped} status="STOPPED" />
    <Link className={buttonClassName({ variant: "ghost" })} href="/app/personal/medications">รายการล่าสุด</Link>
  </div>;
}
