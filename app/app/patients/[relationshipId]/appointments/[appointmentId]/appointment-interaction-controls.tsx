"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS,
  APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE,
  APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE,
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
  const pending = acknowledgementPending || cancellationPending || coordinationPending || approvalPending || rejectionPending;
  const pendingRequest = cancellationRequests.find((request) => request.status === "PENDING");
  const reviewWasSuperseded =
    (approvalState.status === "SUCCESS" && approvalState.operation === "CANCELLATION_SUPERSEDED") ||
    (rejectionState.status === "SUCCESS" && rejectionState.operation === "CANCELLATION_SUPERSEDED");

  return (
    <Panel>
      <div className="space-y-6">
        <section aria-labelledby="appointment-acknowledgement-heading">
          <h2 className="text-lg font-semibold" id="appointment-acknowledgement-heading">การรับทราบนัดหมาย</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">{APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE}</p>
          <p className="mt-2 break-words text-sm text-text" role="status">
            {acknowledgement
              ? `รับทราบนัดหมายแล้วโดย ${acknowledgement.recordedByDisplayName ?? APPOINTMENT_INTERACTION_SOURCE_LABELS[acknowledgement.source]} · ${formatInteractionTime(acknowledgement.acknowledgedAt)}`
              : "ยังไม่มีการรับทราบนัดหมายสำหรับกำหนดการนี้"}
          </p>
        </section>
        {canProxyPatientActions ? (
          <section aria-labelledby="appointment-osm-interactions-heading" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]" id="appointment-osm-interactions-heading">
                การประสานงานกับผู้ป่วย
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                บันทึกแทนผู้ป่วยภายใต้สิทธิ์ที่ได้รับมอบหมาย ไม่ใช่การตอบรับงานมอบหมาย OSM
              </p>
            </div>

            {acknowledgement ? null : isScheduled ? (
              <form action={acknowledgeAction}>
                <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
                <input name="appointmentId" type="hidden" value={appointmentId} />
                <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
                <Button className="w-full sm:w-auto" disabled={pending} loading={acknowledgementPending} type="submit">
                  {acknowledgementPending ? "กำลังบันทึก..." : "บันทึกว่าผู้ป่วยรับทราบนัดหมายแล้ว"}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-text-muted">นัดหมายนี้ไม่อยู่ในสถานะที่รับทราบได้</p>
            )}
            {acknowledgementState.status === "SUCCESS" ? (
              <Alert variant="success">บันทึกการรับทราบแทนผู้ป่วยแล้ว</Alert>
            ) : null}

            <p className="text-sm leading-6 text-text-muted">{APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE}</p>

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
                  className="w-full sm:w-auto"
                  disabled={pending}
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
                บันทึกเวลาและผู้ประสานงานเท่านั้น ไม่เปลี่ยนสถานะนัดหรือบันทึกการรับทราบแทนผู้ป่วย
              </p>
            </div>
            <form action={coordinationAction}>
              <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
              <input name="appointmentId" type="hidden" value={appointmentId} />
              <input name="submissionNonce" type="hidden" value={coordinationSubmissionNonce} />
              <Button className="w-full sm:w-auto" disabled={pending} loading={coordinationPending} type="submit" variant="secondary">
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
              <p className="break-words text-sm text-text-muted">
                ส่งคำขอโดย {pendingRequest.submittedByDisplayName ?? APPOINTMENT_INTERACTION_SOURCE_LABELS[pendingRequest.source]} · {formatInteractionTime(pendingRequest.submittedAt)}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <form action={approvalAction}>
                <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
                <input name="appointmentId" type="hidden" value={appointmentId} />
                <input name="requestId" type="hidden" value={pendingRequest.requestId} />
                <Button
                  className="w-full sm:w-auto"
                  disabled={pending}
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
                  className="w-full sm:w-auto"
                  disabled={pending}
                  loading={rejectionPending}
                  type="submit"
                  variant="secondary"
                >
                  {rejectionPending ? "กำลังบันทึก..." : "ปฏิเสธคำขอ"}
                </Button>
              </form>
            </div>
          </section>
        ) : null}

        {canManage && (approvalState.status === "SUCCESS" || rejectionState.status === "SUCCESS") ? (
          <Alert variant={reviewWasSuperseded ? "warning" : "success"}>
            {approvalState.status === "SUCCESS" && approvalState.operation === "CANCELLATION_APPROVED"
              ? "อนุมัติและยกเลิกนัดหมายแล้ว"
              : rejectionState.status === "SUCCESS" && rejectionState.operation === "CANCELLATION_REJECTED"
                ? "ปฏิเสธคำขอแล้ว โดยไม่เปลี่ยนสถานะนัดหมาย"
                : "คำขอนี้สิ้นผลแล้ว เพราะนัดหมายมีการเปลี่ยนแปลง"}
          </Alert>
        ) : null}

        {cancellationRequests.length > 0 ? (
          <section aria-labelledby="appointment-cancellation-history-heading">
            <h2 className="text-sm font-semibold text-text" id="appointment-cancellation-history-heading">
              คำขอยกเลิกล่าสุด (ไม่เกิน 5 รายการ)
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
