"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel } from "@/components/ui/panel";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE,
  APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE,
  APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS,
  APPOINTMENT_INTERACTION_SOURCE_LABELS,
} from "@/modules/appointments/domain/appointment-interaction-definitions";
import { lineWorkflowAppointmentHandlers } from "@/modules/line/domain/line-workflow-routes";
import type {
  LineWorkflowInteractionErrorCode,
  LineWorkflowInteractionResponse,
} from "@/modules/line/transport/workflow-scoped-interactions";
import type { PatientSelfAppointmentDetail } from "@/modules/patient-self/services/patient-self-care-query-service";

type ScopedInteractionState =
  | { status: "IDLE" }
  | { status: "SUCCESS" }
  | { status: "ERROR"; code: LineWorkflowInteractionErrorCode };

type AcknowledgementPayload = { patientHospitalRelationshipId: string; appointmentId: string; expectedUpdatedAt: string };
type CancellationRequestPayload = AcknowledgementPayload & { submissionNonce: string };

const initialState: ScopedInteractionState = { status: "IDLE" };

/** Every finite server code; nothing here was written when a scope check denied (it runs first). */
const errorMessages: Record<LineWorkflowInteractionErrorCode, string> = {
  CONFLICT: "นัดหมายถูกบันทึกหรือเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนดำเนินการอีกครั้ง",
  RESOURCE_INVALID: "ทำรายการกับนัดหมายนี้ไม่ได้ในขณะนี้ กรุณาโหลดข้อมูลล่าสุด",
  REQUEST_INVALID: "ข้อมูลนัดหมายไม่ถูกต้อง กรุณาโหลดข้อมูลล่าสุดแล้วลองอีกครั้ง",
  ORIGIN_DENIED: "ส่งคำขอนี้ไม่ได้ กรุณาเปิดหน้านี้ใหม่จากเมนู DEMI ใน LINE",
  TEMPORARILY_UNAVAILABLE: "ระบบไม่พร้อมบันทึกในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  AUTH_UNAVAILABLE: "ระบบยังตรวจสอบการเข้าสู่ระบบไม่ได้ กรุณาลองใหม่อีกครั้ง",
  RATE_LIMITED: "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่ก่อนลองอีกครั้ง รายการนี้ยังไม่ได้บันทึก",
  SCOPE_MISSING: "หน้านี้ไม่ได้เปิดจากเมนู DEMI ใน LINE ยังไม่ได้บันทึกรายการนี้",
  SCOPE_EXPIRED: "หมดเวลาการใช้งานแล้ว ยังไม่ได้บันทึกรายการนี้ กรุณาเริ่มใหม่จากเมนู DEMI ใน LINE",
  SCOPE_REVOKED: "การเชื่อมบัญชี LINE เปลี่ยนไป ยังไม่ได้บันทึกรายการนี้",
  SESSION_MISMATCH: "การเข้าสู่ระบบ DEMI เปลี่ยนไป ยังไม่ได้บันทึกรายการนี้",
  LOGIN_REQUIRED: "กรุณาเข้าสู่ระบบ DEMI อีกครั้ง ยังไม่ได้บันทึกรายการนี้",
  INELIGIBLE: "บัญชีนี้ทำรายการนัดหมายผ่าน LINE ไม่ได้ ยังไม่ได้บันทึกรายการนี้",
};

/** The page itself must re-render from a fresh scoped read: these states replace it with recovery. */
const scopeDenials = new Set<LineWorkflowInteractionErrorCode>([
  "SCOPE_MISSING", "SCOPE_EXPIRED", "SCOPE_REVOKED", "SESSION_MISMATCH", "LOGIN_REQUIRED", "INELIGIBLE",
]);

function isInteractionResponse(value: unknown): value is LineWorkflowInteractionResponse {
  if (typeof value !== "object" || value === null) return false;
  const body = value as { status?: unknown; code?: unknown };
  return body.status === "SUCCESS" || (body.status === "ERROR" && typeof body.code === "string" && body.code in errorMessages);
}

/**
 * Posts to one fixed scoped Route Handler only. A network failure or an
 * unrecognized reply throws, so the shared mutation state reports an unknown
 * outcome and can resend the identical payload (same version and nonce).
 */
function scopedInteraction<Payload>(path: string) {
  return async (_previous: ScopedInteractionState, payload: Payload): Promise<ScopedInteractionState> => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    const body: unknown = await response.json();
    if (!isInteractionResponse(body)) throw new Error("Unrecognized scoped interaction reply");
    return body.status === "SUCCESS" ? { status: "SUCCESS" } : { status: "ERROR", code: body.code };
  };
}

const acknowledge = scopedInteraction<AcknowledgementPayload>(lineWorkflowAppointmentHandlers.acknowledge);
const requestCancellation = scopedInteraction<CancellationRequestPayload>(lineWorkflowAppointmentHandlers.cancellationRequest);

function formatInteractionTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function ScopedError({ state, onReload }: { state: ScopedInteractionState; onReload: () => void }): React.JSX.Element | null {
  if (state.status !== "ERROR") return null;
  return (
    <Alert role="alert" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
      <p>{errorMessages[state.code]}</p>
      {scopeDenials.has(state.code) || state.code === "RATE_LIMITED" ? null : (
        <Button className="mt-3" onClick={onReload} size="compact" type="button" variant="secondary">
          โหลดข้อมูลล่าสุด
        </Button>
      )}
    </Alert>
  );
}

/**
 * Scoped acknowledgement and cancellation-request controls. Visibility and
 * disabled states are presentation only; every POST is reauthorized by the
 * fixed handler and its in-transaction precondition. No Server Action is
 * imported or reachable from this component.
 */
export function LineWorkflowAppointmentInteractions({
  appointment,
  cancellationRequestNonce,
}: {
  appointment: PatientSelfAppointmentDetail;
  cancellationRequestNonce: string;
}): React.JSX.Element {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [acknowledgementState, dispatchAcknowledgement, acknowledgementPending, acknowledgementUnknown, resendAcknowledgement] =
    useMutationActionState<ScopedInteractionState, AcknowledgementPayload>(acknowledge, initialState);
  const [cancellationState, dispatchCancellation, cancellationPending, cancellationUnknown, resendCancellation] =
    useMutationActionState<ScopedInteractionState, CancellationRequestPayload>(requestCancellation, initialState);

  useEffect(() => {
    // Success and scope denials both re-render from a fresh, server-authorized scoped read.
    const refreshes = (state: ScopedInteractionState): boolean =>
      state.status === "SUCCESS" || (state.status === "ERROR" && scopeDenials.has(state.code));
    if (refreshes(acknowledgementState) || refreshes(cancellationState)) router.refresh();
  }, [acknowledgementState, cancellationState, router]);

  const relationship = appointment.relationship;
  const careEnded = relationship.careEndedAt !== null;
  const canSubmit = appointment.status === "SCHEDULED" && relationship.hospitalStatus === "ACTIVE" && !careEnded;
  const busy = acknowledgementPending || cancellationPending || acknowledgementUnknown || cancellationUnknown;
  const pendingRequest = appointment.cancellationRequests.find((request) => request.status === "PENDING");
  const version = {
    patientHospitalRelationshipId: relationship.relationshipId,
    appointmentId: appointment.appointmentId,
    expectedUpdatedAt: appointment.updatedAt.toISOString(),
  };

  function submitAcknowledgement(): void {
    if (busy) return;
    startTransition(() => dispatchAcknowledgement(version));
  }

  function submitCancellationRequest(): void {
    setConfirming(false);
    if (busy) return;
    startTransition(() => dispatchCancellation({ ...version, submissionNonce: cancellationRequestNonce }));
  }

  return (
    <Panel>
      {careEnded ? (
        <Alert className="mb-5" variant="info">โรงพยาบาลนี้สิ้นสุดการดูแลแล้ว อ่านข้อมูลนัดหมายเดิมได้ แต่รับทราบหรือส่งคำขอยกเลิกไม่ได้</Alert>
      ) : relationship.hospitalStatus !== "ACTIVE" ? (
        <Alert className="mb-5" variant="info">อ่านข้อมูลนัดหมายเดิมได้ แต่ยังรับทราบหรือส่งคำขอยกเลิกไม่ได้ในขณะที่โรงพยาบาลไม่อยู่ในสถานะเปิดใช้งาน</Alert>
      ) : null}
      <section aria-labelledby="line-appointment-response-heading" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text" id="line-appointment-response-heading">
            การรับทราบนัดหมาย
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">{APPOINTMENT_ACKNOWLEDGEMENT_GUIDANCE}</p>
        </div>
        {appointment.acknowledgement ? (
          <p className="text-sm font-semibold text-text" role="status">
            รับทราบนัดหมายแล้ว · {APPOINTMENT_INTERACTION_SOURCE_LABELS[appointment.acknowledgement.source]} · {formatInteractionTime(appointment.acknowledgement.acknowledgedAt)}
          </p>
        ) : canSubmit ? (
          <Button className="min-h-12 w-full sm:w-auto" disabled={busy} loading={acknowledgementPending} onClick={submitAcknowledgement} type="button">
            {acknowledgementPending ? "กำลังบันทึก..." : "รับทราบนัดหมาย"}
          </Button>
        ) : (
          <p className="text-sm text-text-muted">ยังไม่สามารถบันทึกการรับทราบสำหรับนัดหมายนี้ได้</p>
        )}
        {acknowledgementState.status === "SUCCESS" ? <Alert variant="success">บันทึกการรับทราบนัดหมายแล้ว</Alert> : null}
        <ScopedError onReload={() => router.refresh()} state={acknowledgementState} />
        <UnknownOutcomeAlert active={acknowledgementUnknown} recovery={{ kind: "resend", onResend: resendAcknowledgement, resending: acknowledgementPending }} />
      </section>

      <section aria-labelledby="line-appointment-cancellation-heading" className="mt-7 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text" id="line-appointment-cancellation-heading">
            คำขอยกเลิกนัด
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">{APPOINTMENT_CANCELLATION_REQUEST_GUIDANCE}</p>
        </div>
        {pendingRequest ? (
          <p className="text-sm font-semibold text-text" role="status">
            {APPOINTMENT_CANCELLATION_REQUEST_STATUS_LABELS[pendingRequest.status]}
          </p>
        ) : canSubmit ? (
          <Button
            className="min-h-12 w-full sm:w-auto"
            disabled={busy}
            loading={cancellationPending}
            onClick={() => setConfirming(true)}
            type="button"
            variant="secondary"
          >
            {cancellationPending ? "กำลังส่งคำขอ..." : "ส่งคำขอยกเลิกนัดหมาย"}
          </Button>
        ) : (
          <p className="text-sm text-text-muted">ยังไม่สามารถส่งคำขอยกเลิกสำหรับนัดหมายนี้ได้</p>
        )}
        {cancellationState.status === "SUCCESS" ? (
          <Alert variant="success">ส่งคำขอไปยังโรงพยาบาลแล้ว นัดหมายยังไม่ถูกยกเลิกจนกว่าโรงพยาบาลจะพิจารณา</Alert>
        ) : null}
        <ScopedError onReload={() => router.refresh()} state={cancellationState} />
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
      </section>
      <ConfirmDialog
        cancelLabel="กลับ"
        confirmLabel="ส่งคำขอยกเลิก"
        description="คำขอนี้จะส่งให้โรงพยาบาลพิจารณา นัดหมายยังไม่ถูกยกเลิกทันที และจะยังแสดงเป็นนัดหมายเดิมจนกว่าโรงพยาบาลจะดำเนินการ"
        onCancel={() => setConfirming(false)}
        onConfirm={submitCancellationRequest}
        open={confirming}
        title="ส่งคำขอยกเลิกนัดหมายนี้หรือไม่"
      />
    </Panel>
  );
}
