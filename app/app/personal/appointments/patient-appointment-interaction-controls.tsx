"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel } from "@/components/ui/panel";
import { PatientSelfSessionExpiredAlert } from "../patient-self-session-expired-alert";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  acknowledgeOwnPatientAppointmentAction,
  requestOwnPatientAppointmentCancellationAction,
} from "@/modules/appointments/transport/server-actions";
import {
  initialAppointmentInteractionActionState,
  type AppointmentInteractionActionState,
} from "@/modules/appointments/transport/action-state";
import type { PatientSelfAppointmentItem } from "@/modules/patient-self/services/patient-self-care-query-service";

import { RescheduleRequestForm } from "../../patients/[relationshipId]/appointments/reschedule-request-form";
import { formatAppointmentDateTime } from "../../appointment-summary";

export const PATIENT_CANCELLATION_SUCCESS_MESSAGE = "ส่งคำขอยกเลิกแล้ว นัดยังไม่ถูกยกเลิกจนกว่าโรงพยาบาลอนุมัติ";
const ACTIONS_HEADING_ID = "patient-appointment-actions-heading";

/** The reschedule request the Patient may open, decided on the server from the reschedule history. */
export type PatientRescheduleOffer = { nonce: string; expectedUpdatedAt: string } | null;

type PatientAppointmentInteractionControlsProps = {
  relationshipId: string;
  appointment: Pick<PatientSelfAppointmentItem, "appointmentId" | "updatedAt" | "acknowledgement" | "cancellationRequests">;
  appointmentSummary: string;
  cancellationRequestNonce: string;
  reschedule: PatientRescheduleOffer;
};

export function PatientAppointmentActionError({ state }: { state: AppointmentInteractionActionState }): React.JSX.Element | null {
  if (state.status !== "ERROR") {
    return null;
  }

  if (state.loginHref) {
    return <PatientSelfSessionExpiredAlert className="mt-3" href={state.loginHref} message={state.message} />;
  }

  return (
    <Alert className="mt-3" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
      {state.message}
    </Alert>
  );
}

function CheckGlyph(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="size-5 shrink-0" fill="none" viewBox="0 0 20 20">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

/**
 * PATIENT-APPT-DISTILL "สิ่งที่ทำได้": the caller renders this only for a SCHEDULED appointment at an
 * ACTIVE Hospital whose care has not ended. Order on mobile: รับทราบ → ขอเลื่อนนัด → ขอยกเลิกนัด.
 * The server still enforces every rule; hiding a control is never authorization.
 */
export function PatientAppointmentInteractionControls({
  relationshipId,
  appointment,
  appointmentSummary,
  cancellationRequestNonce,
  reschedule,
}: PatientAppointmentInteractionControlsProps): React.JSX.Element {
  const router = useRouter();
  const [acknowledgementState, acknowledgeAction, acknowledgementPending, acknowledgementUnknown, resendAcknowledgement] = useMutationActionState<
    AppointmentInteractionActionState,
    FormData
  >(acknowledgeOwnPatientAppointmentAction, initialAppointmentInteractionActionState);
  const [cancellationState, cancellationAction, cancellationPending, cancellationUnknown, resendCancellation] = useMutationActionState<
    AppointmentInteractionActionState,
    FormData
  >(requestOwnPatientAppointmentCancellationAction, initialAppointmentInteractionActionState);
  // The dialog only guards the first tap. It stays open for the state it was opened on: the next answer
  // (a new state) or an unknown outcome closes it, and the result is shown in the panel.
  const [confirmOpenedFor, setConfirmOpenedFor] = useState<AppointmentInteractionActionState | null>(null);
  const confirmOpen = confirmOpenedFor === cancellationState && !cancellationUnknown;
  const cancelTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (acknowledgementState.status === "SUCCESS" || cancellationState.status === "SUCCESS") {
      router.refresh();
    }
  }, [acknowledgementState, cancellationState, router]);

  const pending = acknowledgementPending || cancellationPending;
  const unknownOutcome = acknowledgementUnknown || cancellationUnknown;
  const acknowledged = appointment.acknowledgement !== null || acknowledgementState.status === "SUCCESS";
  const cancellationRequested = cancellationState.status === "SUCCESS";
  const cancellationPendingAtHospital = appointment.cancellationRequests.some((request) => request.status === "PENDING");

  function submitCancellation(): void {
    const formData = new FormData();
    formData.set("patientHospitalRelationshipId", relationshipId);
    formData.set("appointmentId", appointment.appointmentId);
    formData.set("expectedUpdatedAt", appointment.updatedAt.toISOString());
    formData.set("submissionNonce", cancellationRequestNonce);
    startTransition(() => cancellationAction(formData));
  }

  return (
    <Panel>
      <section aria-labelledby={ACTIONS_HEADING_ID}>
        <h2 className="text-lg font-semibold text-text" id={ACTIONS_HEADING_ID} tabIndex={-1}>สิ่งที่ทำได้</h2>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
          {acknowledged ? (
            <p className="inline-flex min-h-11 items-center gap-2 font-semibold text-success" role="status">
              <CheckGlyph />
              {appointment.acknowledgement
                ? <>รับทราบแล้ว · {formatAppointmentDateTime(appointment.acknowledgement.acknowledgedAt)}</>
                : "รับทราบนัดหมายแล้ว"}
            </p>
          ) : (
            <form action={acknowledgeAction} className="sm:contents">
              <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
              <input name="appointmentId" type="hidden" value={appointment.appointmentId} />
              <input name="expectedUpdatedAt" type="hidden" value={appointment.updatedAt.toISOString()} />
              <Button className="w-full sm:w-auto" disabled={pending || unknownOutcome} loading={acknowledgementPending} type="submit">
                {acknowledgementPending ? "กำลังบันทึก..." : "รับทราบนัดหมาย"}
              </Button>
            </form>
          )}

          {reschedule ? (
            <RescheduleRequestForm
              appointmentId={appointment.appointmentId}
              appointmentSummary={appointmentSummary}
              audience="patient"
              expectedUpdatedAt={reschedule.expectedUpdatedAt}
              nonce={reschedule.nonce}
              relationshipId={relationshipId}
              returnFocusHeadingId={ACTIONS_HEADING_ID}
            />
          ) : null}

          {cancellationPendingAtHospital || cancellationRequested ? null : (
            <Button
              className="w-full text-danger hover:bg-danger-soft hover:text-danger sm:w-auto"
              disabled={pending || unknownOutcome}
              onClick={() => setConfirmOpenedFor(cancellationState)}
              ref={cancelTriggerRef}
              type="button"
              variant="ghost"
            >
              ขอยกเลิกนัด
            </Button>
          )}
        </div>

        <PatientAppointmentActionError state={acknowledgementState} />
        <UnknownOutcomeAlert active={acknowledgementUnknown} recovery={{ kind: "resend", onResend: resendAcknowledgement, resending: acknowledgementPending }} />

        {cancellationRequested ? (
          <Alert className="mt-3" variant="success">{PATIENT_CANCELLATION_SUCCESS_MESSAGE}</Alert>
        ) : null}
        <PatientAppointmentActionError state={cancellationState} />
        <UnknownOutcomeAlert active={cancellationUnknown} recovery={{ kind: "resend", onResend: resendCancellation, resending: cancellationPending }} />
      </section>

      <ConfirmDialog
        cancelLabel="ไม่ใช่ตอนนี้"
        confirmLabel="ส่งคำขอยกเลิก"
        confirmVariant="destructive"
        description={`${appointmentSummary} — โรงพยาบาลจะพิจารณาคำขอ นัดยังไม่ถูกยกเลิกจนกว่าโรงพยาบาลอนุมัติ`}
        onCancel={() => setConfirmOpenedFor(null)}
        onConfirm={submitCancellation}
        open={confirmOpen}
        pending={cancellationPending}
        pendingLabel="กำลังส่งคำขอ..."
        returnFocusTarget={() => cancelTriggerRef.current?.isConnected ? cancelTriggerRef.current : document.getElementById(ACTIONS_HEADING_ID)}
        title="ขอยกเลิกนัดนี้หรือไม่"
      />
    </Panel>
  );
}
