import { randomUUID } from "node:crypto";
import Link from "next/link";

import type { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import { RescheduleRequestDetails } from "./reschedule-request-history";
import { RescheduleRequestForm } from "./reschedule-request-form";

export function RescheduleRequestSection({ history, relationshipId, appointmentId }: { history: Awaited<ReturnType<typeof getAppointmentRescheduleHistory>>; relationshipId: string; appointmentId: string }): React.JSX.Element {
  return <section aria-label="คำขอเลื่อนนัด" className="mt-6 space-y-4 border-t border-border pt-5">
    <h2 className="text-lg font-semibold text-text">คำขอเลื่อนนัด</h2>
    {history.requests.length === 0 ? <p className="text-text-muted">ยังไม่มีคำขอเลื่อนนัด</p> : <ul className="space-y-5">{history.requests.map((request) => <li key={request.id} className="space-y-2">
      <RescheduleRequestDetails request={request} />
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
