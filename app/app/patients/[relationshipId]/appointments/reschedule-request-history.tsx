import type { PatientAppointmentRescheduleRequest } from "@prisma/client";

import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { SavedRecordCard } from "../../../personal/saved-record-card";

const labels = { PENDING: "รอพิจารณา", APPROVED: "อนุมัติและแก้นัดแล้ว", REJECTED: "ปฏิเสธ", SUPERSEDED: "นัดหมายเปลี่ยนแปลงแล้ว" };
const variants: Record<PatientAppointmentRescheduleRequest["status"], StatusVariant> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  SUPERSEDED: "neutral",
};
const format = (date: Date): string => date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

/** One reschedule request's recorded facts; no form, link or Server Action. */
export function RescheduleRequestDetails({ request }: { request: PatientAppointmentRescheduleRequest }): React.JSX.Element {
  return <>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <StatusBadge variant={variants[request.status]}>{labels[request.status]}</StatusBadge>
      <p className="text-sm text-text-muted">
        ผู้ส่งคำขอ: {request.source === "PATIENT_SELF" ? "ผู้ป่วย" : "อสม. แทนผู้ป่วย"} · ส่งเมื่อ{" "}
        <time dateTime={request.submittedAt.toISOString()}>{format(request.submittedAt)}</time>
      </p>
    </div>
    <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0 sm:col-span-2">
        <dt className="text-sm font-semibold text-text-muted">เหตุผลที่ขอเลื่อนนัด</dt>
        <dd className="mt-1 break-words text-text">{request.reason}</dd>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <dt className="text-sm font-semibold text-text-muted">วันและเวลาที่เสนอ</dt>
        <dd className="mt-1">
          <ul className="grid min-w-0 gap-1 text-text-muted sm:grid-cols-2">
            {request.preferredDatetimes.map((date) => <li className="break-words" key={date.toISOString()}>
              <time dateTime={date.toISOString()}>{format(date)}</time>
            </li>)}
          </ul>
        </dd>
      </div>
      {request.resolvedAt ? <div className="min-w-0">
        <dt className="text-sm font-semibold text-text-muted">พิจารณาเมื่อ</dt>
        <dd className="mt-1 text-text"><time dateTime={request.resolvedAt.toISOString()}>{format(request.resolvedAt)}</time></dd>
      </div> : null}
      {request.rejectionReason ? <div className="min-w-0 sm:col-span-2">
        <dt className="text-sm font-semibold text-text-muted">เหตุผลที่ปฏิเสธ</dt>
        <dd className="mt-1 break-words text-text">{request.rejectionReason}</dd>
      </div> : null}
    </dl>
  </>;
}

/** Read-only reschedule-request history for surfaces that must not offer request or review controls. */
export function RescheduleRequestHistory({ requests }: { requests: PatientAppointmentRescheduleRequest[] }): React.JSX.Element {
  return <section aria-label="คำขอเลื่อนนัด" className="mt-6 space-y-4 border-t border-border pt-5">
    <h2 className="text-lg font-semibold text-text">คำขอเลื่อนนัด</h2>
    {requests.length === 0 ? <p className="text-text-muted">ยังไม่มีคำขอเลื่อนนัด</p> : <ul className="space-y-3">{requests.map((request) => <li key={request.id}>
      <SavedRecordCard tone={request.status === "SUPERSEDED" ? "history" : "current"}>
        <RescheduleRequestDetails request={request} />
      </SavedRecordCard>
    </li>)}</ul>}
  </section>;
}
