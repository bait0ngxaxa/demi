"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PatientSelfSessionExpiredAlert } from "../patient-self-session-expired-alert";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS,
  APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE,
  APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE,
  APPOINTMENT_INTERACTION_SOURCE_LABELS,
  APPOINTMENT_RESCHEDULE_GUIDANCE,
} from "@/modules/appointments/domain/appointment-interaction-definitions";
import {
  acknowledgeOwnPatientAppointmentAction,
  requestOwnPatientAppointmentCancellationAction,
} from "@/modules/appointments/transport/server-actions";
import {
  initialAppointmentInteractionActionState,
  type AppointmentInteractionActionState,
} from "@/modules/appointments/transport/action-state";
import type { PatientSelfAppointmentDetail, PatientSelfAppointmentItem } from "@/modules/patient-self/services/patient-self-care-query-service";

type PatientAppointmentInteractionControlsProps = {
  relationshipId: string;
  appointment: PatientSelfAppointmentItem;
  cancellationRequestNonce: string;
  hospitalStatus: PatientSelfAppointmentDetail["relationship"]["hospitalStatus"];
  careEnded: boolean;
};

function formatInteractionTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

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

export function PatientAppointmentInteractionControls({
  relationshipId,
  appointment,
  cancellationRequestNonce,
  hospitalStatus,
  careEnded,
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

  useEffect(() => {
    if (acknowledgementState.status === "SUCCESS" || cancellationState.status === "SUCCESS") {
      router.refresh();
    }
  }, [acknowledgementState, cancellationState, router]);

  const isScheduled = appointment.status === "SCHEDULED";
  const canSubmitPatientInteraction = isScheduled && hospitalStatus === "ACTIVE" && !careEnded;
  const pending = acknowledgementPending || cancellationPending;
  const unknownOutcome = acknowledgementUnknown || cancellationUnknown;
  const pendingRequest = appointment.cancellationRequests.find((request) => request.status === "PENDING");

  return (
    <Panel>
      {careEnded ? (
        <Alert className="mb-5" variant="info">โรงพยาบาลนี้สิ้นสุดการดูแลแล้ว อ่านข้อมูลนัดหมายเดิมได้ แต่รับทราบหรือส่งคำขอยกเลิกไม่ได้</Alert>
      ) : hospitalStatus !== "ACTIVE" ? (
        <Alert className="mb-5" variant="info">อ่านข้อมูลนัดหมายเดิมได้ แต่ยังรับทราบหรือส่งคำขอยกเลิกไม่ได้ในขณะที่โรงพยาบาลไม่อยู่ในสถานะเปิดใช้งาน</Alert>
      ) : null}
      <section aria-labelledby="patient-appointment-response-heading" className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-text" id="patient-appointment-response-heading">
            การรับทราบนัดหมาย
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE}
          </p>
        </div>

        {appointment.acknowledgement ? (
          <p className="text-sm font-semibold text-text" role="status">
            รับทราบนัดหมายแล้ว · {APPOINTMENT_INTERACTION_SOURCE_LABELS[appointment.acknowledgement.source]} · {formatInteractionTime(appointment.acknowledgement.acknowledgedAt)}
          </p>
        ) : canSubmitPatientInteraction ? (
          <form action={acknowledgeAction}>
            <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
            <input name="appointmentId" type="hidden" value={appointment.appointmentId} />
            <input name="expectedUpdatedAt" type="hidden" value={appointment.updatedAt.toISOString()} />
            <Button className="w-full sm:w-auto" disabled={pending || unknownOutcome} loading={acknowledgementPending} type="submit">
              {acknowledgementPending ? "กำลังบันทึก..." : "รับทราบนัดหมาย"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-text-muted">ยังไม่สามารถบันทึกการรับทราบสำหรับนัดหมายนี้ได้</p>
        )}
        {acknowledgementState.status === "SUCCESS" ? (
          <Alert variant="success">บันทึกการรับทราบนัดหมายแล้ว</Alert>
        ) : null}
        <PatientAppointmentActionError state={acknowledgementState} />
        <UnknownOutcomeAlert active={acknowledgementUnknown} recovery={{ kind: "resend", onResend: resendAcknowledgement, resending: acknowledgementPending }} />
      </section>

      <section aria-labelledby="patient-appointment-cancellation-heading" className="mt-7 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text" id="patient-appointment-cancellation-heading">
            คำขอยกเลิกนัด
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE}
          </p>
        </div>

        {pendingRequest ? (
          <p className="text-sm font-semibold text-text" role="status">
            {APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS[pendingRequest.status]}
          </p>
        ) : canSubmitPatientInteraction ? (
          <form action={cancellationAction}>
            <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
            <input name="appointmentId" type="hidden" value={appointment.appointmentId} />
            <input name="expectedUpdatedAt" type="hidden" value={appointment.updatedAt.toISOString()} />
            <input name="submissionNonce" type="hidden" value={cancellationRequestNonce} />
            <Button
              className="w-full sm:w-auto"
              disabled={pending || unknownOutcome}
              loading={cancellationPending}
              type="submit"
              variant="secondary"
            >
              {cancellationPending ? "กำลังส่งคำขอ..." : "ขอยกเลิกนัด"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-text-muted">ยังไม่สามารถส่งคำขอยกเลิกสำหรับนัดหมายนี้ได้</p>
        )}
        {cancellationState.status === "SUCCESS" ? (
          <Alert variant="success">ส่งคำขอไปยังโรงพยาบาลแล้ว นัดหมายยังไม่ถูกยกเลิก</Alert>
        ) : null}
        <PatientAppointmentActionError state={cancellationState} />
        <UnknownOutcomeAlert active={cancellationUnknown} recovery={{ kind: "resend", onResend: resendCancellation, resending: cancellationPending }} />

        {appointment.cancellationRequests.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-text">คำขอยกเลิกล่าสุด (ไม่เกิน 5 รายการ)</h3>
            <ul className="mt-2 space-y-2 text-sm text-text-muted">
              {appointment.cancellationRequests.map((request, index) => (
                <li key={`${request.submittedAt.toISOString()}-${index}`}>
                  {APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS[request.status]} · {APPOINTMENT_INTERACTION_SOURCE_LABELS[request.source]} · {formatInteractionTime(request.submittedAt)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isScheduled ? (
          <p className="border-t border-border pt-4 text-sm leading-6 text-text-muted">
            {APPOINTMENT_RESCHEDULE_GUIDANCE}
          </p>
        ) : null}
      </section>
    </Panel>
  );
}
