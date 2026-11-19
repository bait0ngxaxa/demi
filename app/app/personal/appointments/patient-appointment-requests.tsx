import type { PatientAppointmentRescheduleRequest } from "@prisma/client";

import { Panel } from "@/components/ui/panel";
import type { PatientSelfAppointmentItem } from "@/modules/patient-self/services/patient-self-care-query-service";

import { formatAppointmentDateTime } from "../../appointment-summary";

/*
 * PATIENT-APPT-DISTILL: "What happened to my request?" Built from the reschedule history and the
 * cancellation requests the detail page already loads. Only what the Patient can act on is shown:
 * a request still PENDING, or the latest request about the current schedule when the Hospital
 * REJECTED it. APPROVED needs no card (the summary shows the result); SUPERSEDED and older history
 * stay on staff screens.
 */

export type PatientAppointmentRequestCard =
  | { kind: "RESCHEDULE_PENDING"; key: string; submittedAt: Date; preferredDatetimes: Date[]; reason: string }
  | { kind: "CANCELLATION_PENDING"; key: string; submittedAt: Date }
  | { kind: "RESCHEDULE_REJECTED"; key: string; rejectionReason: string | null }
  | { kind: "CANCELLATION_REJECTED"; key: string };

type RescheduleRequest = Pick<
  PatientAppointmentRescheduleRequest,
  "id" | "status" | "submittedAt" | "sourceAppointmentUpdatedAt" | "preferredDatetimes" | "reason" | "rejectionReason"
>;

/** Requests arrive newest first, as both projections order them. */
export function patientAppointmentRequestCards({
  appointmentUpdatedAt,
  rescheduleRequests,
  cancellationRequests,
}: {
  appointmentUpdatedAt: Date;
  rescheduleRequests: readonly RescheduleRequest[];
  cancellationRequests: PatientSelfAppointmentItem["cancellationRequests"];
}): PatientAppointmentRequestCard[] {
  const aboutCurrentSchedule = (request: { sourceAppointmentUpdatedAt: Date }): boolean =>
    request.sourceAppointmentUpdatedAt.getTime() === appointmentUpdatedAt.getTime();
  const cards: PatientAppointmentRequestCard[] = [];

  for (const request of rescheduleRequests) {
    if (request.status === "PENDING") {
      cards.push({
        kind: "RESCHEDULE_PENDING",
        key: `reschedule-${request.id}`,
        submittedAt: request.submittedAt,
        preferredDatetimes: request.preferredDatetimes,
        reason: request.reason,
      });
    }
  }
  cancellationRequests.forEach((request, index) => {
    if (request.status === "PENDING") {
      cards.push({ kind: "CANCELLATION_PENDING", key: `cancellation-${index}-${request.submittedAt.toISOString()}`, submittedAt: request.submittedAt });
    }
  });

  const latestReschedule = rescheduleRequests.find(aboutCurrentSchedule);
  if (latestReschedule?.status === "REJECTED") {
    cards.push({ kind: "RESCHEDULE_REJECTED", key: `reschedule-${latestReschedule.id}`, rejectionReason: latestReschedule.rejectionReason });
  }
  const latestCancellation = cancellationRequests.find(aboutCurrentSchedule);
  if (latestCancellation?.status === "REJECTED") {
    cards.push({ kind: "CANCELLATION_REJECTED", key: `cancellation-rejected-${latestCancellation.submittedAt.toISOString()}` });
  }

  return cards;
}

function Submitted({ at }: { at: Date }): React.JSX.Element {
  return (
    <p className="mt-1 text-sm text-text-muted">
      ส่งเมื่อ <time dateTime={at.toISOString()}>{formatAppointmentDateTime(at)}</time>
    </p>
  );
}

function RequestCard({ card }: { card: PatientAppointmentRequestCard }): React.JSX.Element {
  switch (card.kind) {
    case "RESCHEDULE_PENDING":
      return (
        <>
          <p className="font-semibold text-text">ขอเลื่อนนัด — รอโรงพยาบาลพิจารณา</p>
          <Submitted at={card.submittedAt} />
          <details className="group mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">
              ดูวันที่เสนอและเหตุผล
            </summary>
            <div className="mt-2 space-y-3 text-sm leading-6">
              <ul className="space-y-1 text-text">
                {card.preferredDatetimes.map((date) => (
                  <li key={date.toISOString()}>
                    <time dateTime={date.toISOString()}>{formatAppointmentDateTime(date)}</time>
                  </li>
                ))}
              </ul>
              <p className="break-words whitespace-pre-wrap text-text-muted">{card.reason}</p>
            </div>
          </details>
        </>
      );
    case "CANCELLATION_PENDING":
      return (
        <>
          <p className="font-semibold text-text">ขอยกเลิกนัด — รอโรงพยาบาลพิจารณา</p>
          <Submitted at={card.submittedAt} />
        </>
      );
    case "RESCHEDULE_REJECTED":
      return (
        <>
          <p className="font-semibold text-text">โรงพยาบาลไม่อนุมัติคำขอเลื่อนนัด</p>
          {card.rejectionReason ? (
            <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-text-muted">{card.rejectionReason}</p>
          ) : null}
        </>
      );
    case "CANCELLATION_REJECTED":
      return <p className="font-semibold text-text">โรงพยาบาลไม่อนุมัติคำขอยกเลิกนัด</p>;
  }
}

export function PatientAppointmentRequests({ cards }: { cards: readonly PatientAppointmentRequestCard[] }): React.JSX.Element | null {
  if (cards.length === 0) return null;

  return (
    <section aria-labelledby="patient-appointment-requests-heading">
      <h2 className="text-lg font-semibold text-text" id="patient-appointment-requests-heading">คำขอของคุณ</h2>
      <Panel className="mt-3">
        <ul className="divide-y divide-border">
          {cards.map((card) => (
            <li className="py-4 first:pt-0 last:pb-0" key={card.key}>
              <RequestCard card={card} />
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}
