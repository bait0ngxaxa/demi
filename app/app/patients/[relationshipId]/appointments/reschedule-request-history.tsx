import type { PatientAppointmentRescheduleRequest } from "@prisma/client";

const labels = { PENDING: "รอพิจารณา", APPROVED: "อนุมัติและแก้นัดแล้ว", REJECTED: "ปฏิเสธ", SUPERSEDED: "นัดหมายเปลี่ยนแปลงแล้ว" };
const format = (date: Date): string => date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

/** One reschedule request's recorded facts; no form, link or Server Action. */
export function RescheduleRequestDetails({ request }: { request: PatientAppointmentRescheduleRequest }): React.JSX.Element {
  return <>
    <p className="font-semibold text-text">{labels[request.status]} · {request.source === "PATIENT_SELF" ? "ผู้ป่วย" : "อสม. แทนผู้ป่วย"} · {format(request.submittedAt)}</p>
    <p className="break-words text-text">เหตุผล: {request.reason}</p>
    <ul className="list-inside list-disc text-text-muted">{request.preferredDatetimes.map((date) => <li key={date.toISOString()}>{format(date)}</li>)}</ul>
    {request.resolvedAt ? <p className="text-sm text-text-muted">พิจารณาเมื่อ {format(request.resolvedAt)}</p> : null}
    {request.rejectionReason ? <p className="break-words text-text">เหตุผลที่ปฏิเสธ: {request.rejectionReason}</p> : null}
  </>;
}

/** Read-only reschedule-request history for surfaces that must not offer request or review controls. */
export function RescheduleRequestHistory({ requests }: { requests: PatientAppointmentRescheduleRequest[] }): React.JSX.Element {
  return <section aria-label="คำขอเลื่อนนัด" className="mt-6 space-y-4 border-t border-border pt-5">
    <h2 className="text-lg font-semibold text-text">คำขอเลื่อนนัด</h2>
    {requests.length === 0 ? <p className="text-text-muted">ยังไม่มีคำขอเลื่อนนัด</p> : <ul className="space-y-5">{requests.map((request) => <li key={request.id} className="space-y-2">
      <RescheduleRequestDetails request={request} />
    </li>)}</ul>}
  </section>;
}
