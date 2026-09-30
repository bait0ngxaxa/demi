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
import type {
  AppointmentAcknowledgementSummary,
  AppointmentCancellationRequestSummary,
  AppointmentCoordinationSummary,
} from "@/modules/appointments/services/appointment-query-service";
import {
  acknowledgeAppointmentOnBehalfOfPatientAction,
  approveAppointmentCancellationRequestAction,
  recordAppointmentCoordinationAction,
  rejectAppointmentCancellationRequestAction,
  requestAppointmentCancellationOnBehalfOfPatientAction,
} from "@/modules/appointments/transport/server-actions";
import {
  initialAppointmentInteractionActionState,
  type AppointmentInteractionActionState,
} from "@/modules/appointments/transport/action-state";

type AppointmentInteractionControlsProps = {
  relationshipId: string;
  appointmentId: string;
  expectedUpdatedAt: string;
  status: string;
  canProxyPatientActions: boolean;
  canRecordCoordination: boolean;
  canManage: boolean;
  acknowledgement: AppointmentAcknowledgementSummary | null;
  cancellationRequests: AppointmentCancellationRequestSummary[];
  coordinationEvents: AppointmentCoordinationSummary[];
  cancellationRequestNonce: string;
  coordinationSubmissionNonce: string;
};

function formatInteractionTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function ActionErrors({
  states,
}: {
  states: readonly AppointmentInteractionActionState[];
}): React.JSX.Element | null {
  const errorState = states.find((state) => state.status === "ERROR");

  if (!errorState || errorState.status !== "ERROR") {
    return null;
  }

  return (
    <Alert className="mt-4" variant={errorState.code === "CONFLICT" ? "warning" : "danger"}>
      {errorState.message}
    </Alert>
  );
}

export function AppointmentInteractionControls({
  relationshipId,
  appointmentId,
  expectedUpdatedAt,
  status,
  canProxyPatientActions,
  canRecordCoordination,
  canManage,
  acknowledgement,
  cancellationRequests,
  coordinationEvents,
  cancellationRequestNonce,
  coordinationSubmissionNonce,
}: AppointmentInteractionControlsProps): React.JSX.Element | null {
  const router = useRouter();
  const [acknowledgementState, acknowledgeAction, acknowledgementPending] = useActionState<
    AppointmentInteractionActionState,
    FormData
  >(acknowledgeAppointmentOnBehalfOfPatientAction, initialAppointmentInteractionActionState);
  const [cancellationState, cancellationAction, cancellationPending] = useActionState<
    AppointmentInteractionActionState,
    FormData
  >(requestAppointmentCancellationOnBehalfOfPatientAction, initialAppointmentInteractionActionState);
  const [coordinationState, coordinationAction, coordinationPending] = useActionState<
    AppointmentInteractionActionState,
    FormData
  >(recordAppointmentCoordinationAction, initialAppointmentInteractionActionState);
  const [approvalState, approvalAction, approvalPending] = useActionState<
    AppointmentInteractionActionState,
    FormData
  >(approveAppointmentCancellationRequestAction, initialAppointmentInteractionActionState);
  const [rejectionState, rejectionAction, rejectionPending] = useActionState<
    AppointmentInteractionActionState,
    FormData
  >(rejectAppointmentCancellationRequestAction, initialAppointmentInteractionActionState);

  useEffect(() => {
    if (
      acknowledgementState.status === "SUCCESS" ||
      cancellationState.status === "SUCCESS" ||
      coordinationState.status === "SUCCESS" ||
      approvalState.status === "SUCCESS" ||
      rejectionState.status === "SUCCESS"
    ) {
      router.refresh();
    }
  }, [
    acknowledgementState,
    approvalState,
    cancellationState,
    coordinationState,
    rejectionState,
    router,
  ]);

  const isScheduled = status === "SCHEDULED";
  const pendingRequest = cancellationRequests.find((request) => request.status === "PENDING");
  const hasInteractions =
    canProxyPatientActions ||
    canRecordCoordination ||
    Boolean(acknowledgement) ||
    cancellationRequests.length > 0 ||
    coordinationEvents.length > 0;
  const reviewWasSuperseded =
    (approvalState.status === "SUCCESS" && approvalState.operation === "CANCELLATION_SUPERSEDED") ||
    (rejectionState.status === "SUCCESS" && rejectionState.operation === "CANCELLATION_SUPERSEDED");

  if (!hasInteractions) {
    return null;
  }

  return (
    <Panel>
      <div className="space-y-6">
        {canProxyPatientActions ? (
          <section aria-labelledby="appointment-osm-interactions-heading" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="appointment-osm-interactions-heading">
                การประสานงานกับผู้ป่วย
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                การรับทราบแทนผู้ป่วยเป็นเพียงการบันทึกว่าได้รับแจ้งนัดแล้ว ไม่ใช่การยืนยันว่าจะมา
              </p>
            </div>

            {acknowledgement ? (
              <p className="text-sm text-text-muted" role="status">
                รับทราบนัดหมายแล้วโดย {acknowledgement.recordedByDisplayName ?? APPOINTMENT_INTERACTION_SOURCE_LABELS[acknowledgement.source]} · {formatInteractionTime(acknowledgement.acknowledgedAt)}
              </p>
            ) : isScheduled ? (
              <form action={acknowledgeAction}>
                <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
                <input name="appointmentId" type="hidden" value={appointmentId} />
                <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
                <Button disabled={acknowledgementPending} loading={acknowledgementPending} type="submit">
                  {acknowledgementPending ? "กำลังบันทึก..." : "บันทึกว่าผู้ป่วยรับทราบนัดหมายแล้ว"}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-text-muted">นัดหมายนี้ไม่อยู่ในสถานะที่รับทราบได้</p>
            )}
            {acknowledgementState.status === "SUCCESS" ? (
              <Alert variant="success">บันทึกการรับทราบแทนผู้ป่วยแล้ว</Alert>
            ) : null}

            {pendingRequest ? (
              <p className="text-sm font-semibold text-text" role="status">
                {APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS[pendingRequest.status]}
              </p>
            ) : isScheduled ? (
              <form action={cancellationAction}>
                <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
                <input name="appointmentId" type="hidden" value={appointmentId} />
                <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
                <input name="submissionNonce" type="hidden" value={cancellationRequestNonce} />
                <Button
                  disabled={cancellationPending}
                  loading={cancellationPending}
                  type="submit"
                  variant="secondary"
                >
                  {cancellationPending ? "กำลังส่งคำขอ..." : "ส่งคำขอยกเลิกแทนผู้ป่วย"}
                </Button>
              </form>
            ) : null}
            {cancellationState.status === "SUCCESS" ? (
              <Alert variant="success">ส่งคำขอยกเลิกไปยังโรงพยาบาลแล้ว นัดหมายยังไม่ถูกยกเลิก</Alert>
            ) : null}
            {isScheduled ? (
              <p className="border-t border-border pt-4 text-sm leading-6 text-text-muted">
                {APPOINTMENT_RESCHEDULE_GUIDANCE}
              </p>
            ) : null}
          </section>
        ) : null}

        {canRecordCoordination ? (
          <section aria-labelledby="appointment-coordination-heading" className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-text" id="appointment-coordination-heading">
                บันทึกการประสานงาน
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                ระบบบันทึกเวลาและผู้บันทึก โดยไม่มีช่องกรอกข้อความอิสระ
              </p>
            </div>
            <form action={coordinationAction}>
              <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
              <input name="appointmentId" type="hidden" value={appointmentId} />
              <input name="submissionNonce" type="hidden" value={coordinationSubmissionNonce} />
              <Button disabled={coordinationPending} loading={coordinationPending} type="submit" variant="secondary">
                {coordinationPending ? "กำลังบันทึก..." : "บันทึกว่าประสานงานแล้ว"}
              </Button>
            </form>
            {coordinationState.status === "SUCCESS" ? (
              <Alert variant="success">บันทึกเวลาและผู้ประสานงานแล้ว</Alert>
            ) : null}
            {coordinationEvents.length > 0 ? (
              <ul className="space-y-1 text-sm text-text-muted">
                {coordinationEvents.map((event, index) => (
                  <li key={`${event.recordedAt.toISOString()}-${index}`}>
                    ประสานงานโดย {event.recordedByDisplayName ?? "ไม่ระบุชื่อ"} · {formatInteractionTime(event.recordedAt)}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {canManage && pendingRequest ? (
          <section aria-labelledby="appointment-cancellation-review-heading" className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-text" id="appointment-cancellation-review-heading">
                พิจารณาคำขอยกเลิกนัด
              </h2>
              <p className="text-sm leading-6 text-text-muted">
                การอนุมัติจะยกเลิกนัดหมายทันที ส่วนการปฏิเสธจะคงนัดหมายไว้ตามเดิม
              </p>
              <p className="text-sm text-text-muted">
                ส่งคำขอโดย {pendingRequest.submittedByDisplayName ?? APPOINTMENT_INTERACTION_SOURCE_LABELS[pendingRequest.source]} · {formatInteractionTime(pendingRequest.submittedAt)}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <form action={approvalAction}>
                <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
                <input name="appointmentId" type="hidden" value={appointmentId} />
                <input name="requestId" type="hidden" value={pendingRequest.requestId} />
                <Button
                  disabled={approvalPending || rejectionPending}
                  loading={approvalPending}
                  onClick={(event) => {
                    if (!window.confirm("อนุมัติคำขอนี้และยกเลิกนัดหมายหรือไม่")) {
                      event.preventDefault();
                    }
                  }}
                  type="submit"
                >
                  {approvalPending ? "กำลังยกเลิกนัด..." : "อนุมัติและยกเลิกนัด"}
                </Button>
              </form>
              <form action={rejectionAction}>
                <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
                <input name="appointmentId" type="hidden" value={appointmentId} />
                <input name="requestId" type="hidden" value={pendingRequest.requestId} />
                <Button
                  disabled={approvalPending || rejectionPending}
                  loading={rejectionPending}
                  type="submit"
                  variant="secondary"
                >
                  {rejectionPending ? "กำลังบันทึก..." : "ปฏิเสธคำขอ"}
                </Button>
              </form>
            </div>
            {approvalState.status === "SUCCESS" || rejectionState.status === "SUCCESS" ? (
              <Alert variant={reviewWasSuperseded ? "warning" : "success"}>
                {approvalState.status === "SUCCESS" && approvalState.operation === "CANCELLATION_APPROVED"
                  ? "อนุมัติและยกเลิกนัดหมายแล้ว"
                  : rejectionState.status === "SUCCESS" && rejectionState.operation === "CANCELLATION_REJECTED"
                    ? "ปฏิเสธคำขอแล้ว และนัดหมายยังคงอยู่"
                    : "คำขอนี้สิ้นผลแล้ว เพราะนัดหมายมีการเปลี่ยนแปลง"}
              </Alert>
            ) : null}
          </section>
        ) : null}

        {cancellationRequests.length > 0 ? (
          <section aria-labelledby="appointment-cancellation-history-heading">
            <h2 className="text-sm font-semibold text-text" id="appointment-cancellation-history-heading">
              ประวัติคำขอยกเลิก
            </h2>
            <ul className="mt-2 space-y-2 text-sm text-text-muted">
              {cancellationRequests.map((request) => (
                <li key={request.requestId}>
                  {APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS[request.status]} · {APPOINTMENT_INTERACTION_SOURCE_LABELS[request.source]} · {formatInteractionTime(request.submittedAt)}
                  {request.resolvedByDisplayName
                    ? ` · พิจารณาโดย ${request.resolvedByDisplayName}`
                    : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ActionErrors
          states={[acknowledgementState, cancellationState, coordinationState, approvalState, rejectionState]}
        />
      </div>
    </Panel>
  );
}
