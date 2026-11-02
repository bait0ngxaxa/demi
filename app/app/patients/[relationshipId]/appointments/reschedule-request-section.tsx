import { randomUUID } from "node:crypto";
import Link from "next/link";

import type { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import { RescheduleRequestDetails } from "./reschedule-request-history";
import { RescheduleRequestForm } from "./reschedule-request-form";

function formatRequestDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(value);
}

export function RescheduleRequestSection({ history, relationshipId, appointmentId, appointmentSummary }: {
  history: Awaited<ReturnType<typeof getAppointmentRescheduleHistory>>;
  relationshipId: string;
  appointmentId: string;
  appointmentSummary: string;
}): React.JSX.Element {
  const headingId = `reschedule-requests-heading-${appointmentId}`;
  return <section aria-label="คำขอเลื่อนนัด" className="mt-6 space-y-4 border-t border-border pt-5">
    <h2 className="text-lg font-semibold text-text" id={headingId} tabIndex={-1}>คำขอเลื่อนนัด</h2>
    {history.requests.length === 0 ? <p className="text-text-muted">ยังไม่มีคำขอเลื่อนนัด</p> : <ul className="space-y-5">{history.requests.map((request) => <li key={request.id} className="space-y-2">
      <RescheduleRequestDetails request={request} />
      {history.canReview && history.scheduled && request.status === "PENDING" ? <>
        <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline" href={`/app/patients/${relationshipId}/appointments/${appointmentId}/edit?requestId=${request.id}`}>อนุมัติโดยแก้ไขวันเวลานัดหมาย</Link>
        <RescheduleRequestForm
          appointmentId={appointmentId}
          appointmentSummary={appointmentSummary}
          relationshipId={relationshipId}
          requestContext={{
            preferredDatetimes: request.preferredDatetimes.map(formatRequestDate),
            reason: request.reason,
            requester: request.source === "PATIENT_SELF" ? "ผู้ป่วย" : "อสม. แทนผู้ป่วย",
            submittedAt: formatRequestDate(request.submittedAt),
          }}
          requestId={request.id}
          returnFocusHeadingId={headingId}
        />
      </> : null}
    </li>)}</ul>}
    {history.canRequest && history.scheduled && !history.requests.some((request) => request.status === "PENDING") ? <RescheduleRequestForm
      appointmentId={appointmentId}
      appointmentSummary={appointmentSummary}
      expectedUpdatedAt={history.updatedAt.toISOString()}
      nonce={randomUUID()}
      relationshipId={relationshipId}
      returnFocusHeadingId={headingId}
    /> : null}
  </section>;
}
