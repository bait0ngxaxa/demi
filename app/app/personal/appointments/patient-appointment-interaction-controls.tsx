"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS,
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
import type { PatientSelfAppointmentItem } from "@/modules/patient-self/services/patient-self-care-query-service";

type PatientAppointmentInteractionControlsProps = {
  relationshipId: string;
  appointment: PatientSelfAppointmentItem;
  cancellationRequestNonce: string;
};

function ActionError({ state }: { state: AppointmentInteractionActionState }): React.JSX.Element | null {
  if (state.status !== "ERROR") {
    return null;
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
}: PatientAppointmentInteractionControlsProps): React.JSX.Element {
  const router = useRouter();
  const [acknowledgementState, acknowledgeAction, acknowledgementPending] = useActionState<
    AppointmentInteractionActionState,
    FormData
  >(acknowledgeOwnPatientAppointmentAction, initialAppointmentInteractionActionState);
  const [cancellationState, cancellationAction, cancellationPending] = useActionState<
    AppointmentInteractionActionState,
    FormData
  >(requestOwnPatientAppointmentCancellationAction, initialAppointmentInteractionActionState);

  useEffect(() => {
    if (acknowledgementState.status === "SUCCESS" || cancellationState.status === "SUCCESS") {
      router.refresh();
    }
  }, [acknowledgementState, cancellationState, router]);

  const isScheduled = appointment.status === "SCHEDULED";
  const pendingRequest = appointment.cancellationRequests.find((request) => request.status === "PENDING");

  return (
    <Panel>
      <section aria-labelledby="patient-appointment-response-heading" className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-text" id="patient-appointment-response-heading">
            การรับทราบนัดหมาย
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            การรับทราบเป็นเพียงการบันทึกว่าเห็นข้อมูลนัดแล้ว ไม่ใช่การยืนยันว่าจะเข้ารับบริการ
          </p>
        </div>

        {appointment.acknowledgement ? (
          <p className="text-sm font-semibold text-text" role="status">
            รับทราบนัดหมายแล้ว · {APPOINTMENT_INTERACTION_SOURCE_LABELS[appointment.acknowledgement.source]}
          </p>
        ) : isScheduled ? (
          <form action={acknowledgeAction}>
            <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
            <input name="appointmentId" type="hidden" value={appointment.appointmentId} />
            <input name="expectedUpdatedAt" type="hidden" value={appointment.updatedAt.toISOString()} />
            <Button disabled={acknowledgementPending} loading={acknowledgementPending} type="submit">
              {acknowledgementPending ? "กำลังบันทึก..." : "รับทราบนัดหมาย"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-text-muted">นัดหมายนี้ไม่อยู่ในสถานะที่รับทราบได้</p>
        )}
        {acknowledgementState.status === "SUCCESS" ? (
          <Alert variant="success">บันทึกการรับทราบนัดหมายแล้ว</Alert>
        ) : null}
        <ActionError state={acknowledgementState} />
      </section>

      <section aria-labelledby="patient-appointment-cancellation-heading" className="mt-7 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text" id="patient-appointment-cancellation-heading">
            คำขอยกเลิกนัด
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            การส่งคำขอไม่ได้ยกเลิกนัดทันที โรงพยาบาลจะเป็นผู้พิจารณาและดำเนินการยกเลิก
          </p>
        </div>

        {pendingRequest ? (
          <p className="text-sm font-semibold text-text" role="status">
            {APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS[pendingRequest.status]}
          </p>
        ) : isScheduled ? (
          <form action={cancellationAction}>
            <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
            <input name="appointmentId" type="hidden" value={appointment.appointmentId} />
            <input name="expectedUpdatedAt" type="hidden" value={appointment.updatedAt.toISOString()} />
            <input name="submissionNonce" type="hidden" value={cancellationRequestNonce} />
            <Button
              disabled={cancellationPending}
              loading={cancellationPending}
              type="submit"
              variant="secondary"
            >
              {cancellationPending ? "กำลังส่งคำขอ..." : "ขอยกเลิกนัด"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-text-muted">นัดหมายนี้ไม่อยู่ในสถานะที่ส่งคำขอยกเลิกได้</p>
        )}
        {cancellationState.status === "SUCCESS" ? (
          <Alert variant="success">ส่งคำขอไปยังโรงพยาบาลแล้ว นัดหมายยังไม่ถูกยกเลิก</Alert>
        ) : null}
        <ActionError state={cancellationState} />

        {appointment.cancellationRequests.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-text">ประวัติคำขอ</h3>
            <ul className="mt-2 space-y-2 text-sm text-text-muted">
              {appointment.cancellationRequests.map((request, index) => (
                <li key={`${request.submittedAt.toISOString()}-${index}`}>
                  {APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS[request.status]} · {APPOINTMENT_INTERACTION_SOURCE_LABELS[request.source]}
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
