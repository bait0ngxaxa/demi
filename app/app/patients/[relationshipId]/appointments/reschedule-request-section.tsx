import { randomUUID } from "node:crypto";
import Link from "next/link";

import type { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import { SavedRecordActions, SavedRecordCard } from "../../../personal/saved-record-card";
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
    {history.requests.length === 0 ? <p className="text-text-muted">ยังไม่มีคำขอเลื่อนนัด</p> : <ul className="space-y-3">{history.requests.map((request) => <li key={request.id}>
      <SavedRecordCard tone={request.status === "SUPERSEDED" ? "history" : "current"}>
        <RescheduleRequestDetails request={request} />
        {history.canReview && history.scheduled && request.status === "PENDING" ? <SavedRecordActions>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong px-4 text-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/patients/${relationshipId}/appointments/${appointmentId}/edit?requestId=${request.id}`}>อนุมัติโดยแก้ไขวันเวลานัดหมาย</Link>
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
        </SavedRecordActions> : null}
      </SavedRecordCard>
    </li>)}</ul>}
    {history.canRequest && history.scheduled && !history.requests.some((request) => request.status === "PENDING") ? <section aria-labelledby={`${headingId}-new`} className="border-t border-border pt-4">
      <h3 className="text-base font-semibold text-text" id={`${headingId}-new`}>ส่งคำขอเลื่อนนัดใหม่</h3>
      <div className="mt-3">
        <RescheduleRequestForm
          appointmentId={appointmentId}
          appointmentSummary={appointmentSummary}
          expectedUpdatedAt={history.updatedAt.toISOString()}
          nonce={randomUUID()}
          relationshipId={relationshipId}
          returnFocusHeadingId={headingId}
        />
      </div>
    </section> : null}
  </section>;
}
