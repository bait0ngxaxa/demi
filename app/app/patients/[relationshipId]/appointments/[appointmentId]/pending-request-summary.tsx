import type { AppointmentInteractionSource } from "@prisma/client";

import { Alert } from "@/components/ui/alert";
import {
  APPOINTMENT_REQUEST_KIND_LABELS,
  APPOINTMENT_REQUESTER_LABELS,
  type AppointmentRequestKind,
} from "@/modules/appointments/domain/appointment-request-kinds";
import type { AppointmentStatusValue } from "@/modules/appointments/domain/appointment-definitions";

/** Heading the cancellation review section renders; the summary links to it. */
export const APPOINTMENT_CANCELLATION_REVIEW_HEADING_ID = "appointment-cancellation-review-heading";

/** Heading the reschedule request section renders for one appointment; the summary links to it. */
export function rescheduleRequestsHeadingId(appointmentId: string): string {
  return `reschedule-requests-heading-${appointmentId}`;
}

type PendingRequest = {
  status: string;
  source: AppointmentInteractionSource;
  submittedAt: Date;
};

function formatRequestDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(value);
}

type SummaryEntry = {
  kind: AppointmentRequestKind;
  source: AppointmentInteractionSource;
  submittedAt: Date;
  preferredDatetimes: readonly Date[];
  anchor: string;
};

/**
 * Tells a reviewer at the top of the page which requests wait for their decision (APPT-REQ-TYPE). Each kind appears
 * only for a viewer who can decide it, and only while the appointment is SCHEDULED; anyone else relies on the
 * request sections themselves. Renders nothing when no decidable request is pending.
 */
export function PendingRequestSummary({
  appointmentId,
  status,
  cancellation,
  reschedule,
}: {
  appointmentId: string;
  status: AppointmentStatusValue;
  cancellation: { canDecide: boolean; requests: readonly PendingRequest[] };
  reschedule: { canDecide: boolean; requests: readonly (PendingRequest & { preferredDatetimes: readonly Date[] })[] };
}): React.JSX.Element | null {
  if (status !== "SCHEDULED") return null;
  const pendingCancellation = cancellation.canDecide
    ? cancellation.requests.find((request) => request.status === "PENDING")
    : undefined;
  const pendingReschedule = reschedule.canDecide
    ? reschedule.requests.find((request) => request.status === "PENDING")
    : undefined;
  const entries: SummaryEntry[] = [
    ...(pendingCancellation ? [{
      kind: "CANCELLATION" as const, source: pendingCancellation.source, submittedAt: pendingCancellation.submittedAt,
      preferredDatetimes: [], anchor: APPOINTMENT_CANCELLATION_REVIEW_HEADING_ID,
    }] : []),
    ...(pendingReschedule ? [{
      kind: "RESCHEDULE" as const, source: pendingReschedule.source, submittedAt: pendingReschedule.submittedAt,
      preferredDatetimes: pendingReschedule.preferredDatetimes, anchor: rescheduleRequestsHeadingId(appointmentId),
    }] : []),
  ];
  if (entries.length === 0) return null;

  return (
    <Alert aria-labelledby="appointment-pending-request-summary-heading" variant="warning">
      <p className="font-semibold" id="appointment-pending-request-summary-heading">คำขอรอคุณพิจารณา</p>
      <ul className="mt-2 space-y-2">
        {entries.map((entry) => (
          <li className="break-words" key={entry.kind}>
            <span className="font-semibold">{APPOINTMENT_REQUEST_KIND_LABELS[entry.kind]}</span>
            {" — จาก"}{APPOINTMENT_REQUESTER_LABELS[entry.source]} เมื่อ {formatRequestDate(entry.submittedAt)}
            {entry.preferredDatetimes.length > 0
              ? <> · วันที่ต้องการ {entry.preferredDatetimes.map(formatRequestDate).join(", ")}</>
              : null}
            {" "}
            <a
              className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              href={`#${entry.anchor}`}
            >
              ไปที่คำขอ
            </a>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
