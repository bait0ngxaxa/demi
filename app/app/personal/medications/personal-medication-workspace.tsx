"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PersonalMedicationDetailDto, PersonalMedicationPage } from "@/modules/medications/domain/personal-medication-definitions";
import type { PersonalMedicationActionState } from "@/modules/medications/transport/action-state";
import { MedicationEditor, MedicationStopForm, MedicationScheduleEditor, MedicationFeedback } from "./personal-medication-controls";

function SelectedMedicationForms({ item, onFeedback }: { item: PersonalMedicationDetailDto; onFeedback: (state: PersonalMedicationActionState) => void }): React.JSX.Element {
  const [blocked, setBlocked] = useState(false);
  const onSubmit = useCallback(() => setBlocked(true), []);
  const onResult = useCallback((state: PersonalMedicationActionState) => {
    setBlocked(state.status === "SUCCESS" || state.status === "CONFLICT" || Boolean(state.refreshRequired));
    if (state.status === "SUCCESS") onFeedback(state);
  }, [onFeedback]);
  const coordination = { blocked, onSubmit, onResult };
  return <><MedicationEditor item={item} coordination={coordination} />
    <MedicationScheduleEditor item={item} coordination={coordination} />
    <MedicationStopForm item={item} coordination={coordination} /></>;
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

export function PersonalMedicationWorkspace({ active, stopped, selected, safeError }: {
  active: PersonalMedicationPage; stopped: PersonalMedicationPage; selected: PersonalMedicationDetailDto | null; safeError?: string;
}): React.JSX.Element {
  const [feedback, setFeedback] = useState<PersonalMedicationActionState>({ status: "IDLE" });
  return <div className="max-w-4xl space-y-6">
    <PageHeader title="ยาของฉัน" description="รายการยาที่คุณบันทึก" />
    <p className="max-w-prose text-text-muted">ใช้ติดตามรายการส่วนตัวใน DEMI ข้อความประกอบเป็นข้อมูลที่คุณกรอก ไม่ใช่คำแนะนำทางการแพทย์จาก DEMI</p>
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
