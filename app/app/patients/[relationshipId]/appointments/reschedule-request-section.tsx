import { randomUUID } from "node:crypto";
import Link from "next/link";

import type { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import { RescheduleRequestForm } from "./reschedule-request-form";

export function RescheduleRequestSection({ history, relationshipId, appointmentId }: { history: Awaited<ReturnType<typeof getAppointmentRescheduleHistory>>; relationshipId: string; appointmentId: string }): React.JSX.Element {
  const labels = { PENDING: "รอพิจารณา", APPROVED: "อนุมัติและแก้นัดแล้ว", REJECTED: "ปฏิเสธ", SUPERSEDED: "นัดหมายเปลี่ยนแปลงแล้ว" };
  const format = (date: Date): string => date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
  return <section aria-label="คำขอเลื่อนนัด" className="mt-6 space-y-4 border-t border-border pt-5">
    <h2 className="text-lg font-semibold text-text">คำขอเลื่อนนัด</h2>
    {history.requests.length === 0 ? <p className="text-text-muted">ยังไม่มีคำขอเลื่อนนัด</p> : <ul className="space-y-5">{history.requests.map((request) => <li key={request.id} className="space-y-2">
      <p className="font-semibold text-text">{labels[request.status]} · {request.source === "PATIENT_SELF" ? "ผู้ป่วย" : "อสม. แทนผู้ป่วย"} · {format(request.submittedAt)}</p>
      <p className="break-words text-text">เหตุผล: {request.reason}</p>
      <ul className="list-inside list-disc text-text-muted">{request.preferredDatetimes.map((date) => <li key={date.toISOString()}>{format(date)}</li>)}</ul>
      {request.resolvedAt ? <p className="text-sm text-text-muted">พิจารณาเมื่อ {format(request.resolvedAt)}</p> : null}
      {request.rejectionReason ? <p className="break-words text-text">เหตุผลที่ปฏิเสธ: {request.rejectionReason}</p> : null}
      {history.canReview && history.scheduled && request.status === "PENDING" ? <>
        <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline" href={`/app/patients/${relationshipId}/appointments/${appointmentId}/edit?requestId=${request.id}`}>อนุมัติโดยแก้ไขวันเวลานัดหมาย</Link>
        <details><summary className="min-h-11 cursor-pointer content-center font-semibold text-text">ปฏิเสธคำขอพร้อมเหตุผล</summary><RescheduleRequestForm relationshipId={relationshipId} appointmentId={appointmentId} requestId={request.id} /></details>
      </> : null}
    </li>)}</ul>}
    {history.canRequest && history.scheduled && !history.requests.some((request) => request.status === "PENDING") ? <details>
      <summary className="min-h-11 cursor-pointer content-center font-semibold text-brand-strong">ขอเลื่อนนัด</summary>
      <RescheduleRequestForm relationshipId={relationshipId} appointmentId={appointmentId} expectedUpdatedAt={history.updatedAt.toISOString()} nonce={randomUUID()} />
    </details> : null}
  </section>;
}
