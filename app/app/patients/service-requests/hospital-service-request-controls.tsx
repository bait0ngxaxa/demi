"use client";

import { useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { APPOINTMENT_DEFAULT_DURATION_MINUTES } from "@/modules/appointments/domain/appointment-definitions";
import { PATIENT_SERVICE_REQUEST_REJECTION_REASON_MAX_LENGTH } from "@/modules/patient-service-requests/domain/patient-service-definitions";
import {
  formatPatientServicePreferredDate,
  patientServiceLabel,
  patientServiceRequestSlotLabel,
  preferredSlotDateTimeInput,
} from "@/modules/patient-service-requests/presentation/patient-service-request-presentation";
import type { HospitalPatientServiceRequestView } from "@/modules/patient-service-requests/services/patient-service-request-service";
import type { PatientServiceMutationActionState } from "@/modules/patient-service-requests/transport/action-state";

const inputClassName = "min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";
const labelClassName = "block space-y-1 text-sm font-semibold text-text";

function bangkokIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+07:00` : "";
}

type DialogMode = "confirm" | "reject";
export type HospitalServiceRequestResolvedMutation = {
  kind: DialogMode;
  requestId: string;
  state: PatientServiceMutationActionState;
} | null;

/**
 * ADR-0023 (SR-D1): confirming books the visit (PENDING, or an eligible legacy APPROVED
 * request); rejecting a PENDING request requires a patient-visible reason. Choosing another
 * eligible Hospital อสม. creates a one-off visit and never changes the patient's assignment.
 */
export function HospitalPatientServiceRequestReviewControls({
  request,
  submissionNonce,
  confirmAction,
  rejectAction,
  onConfirmSubmit,
  onRejectSubmit,
  resolvedMutation,
  pending,
  blocked = false,
  onReviewOpen,
  returnFocusToFeedback,
}: {
  request: HospitalPatientServiceRequestView;
  /** Server-issued so retries of this confirmation keep the same appointment identity. */
  submissionNonce: string;
  confirmAction: (formData: FormData) => void;
  rejectAction: (formData: FormData) => void;
  onConfirmSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRejectSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resolvedMutation: HospitalServiceRequestResolvedMutation;
  pending: boolean;
  /** Set while any request mutation is pending or has an unconfirmed outcome. */
  blocked?: boolean;
  onReviewOpen: () => void;
  returnFocusToFeedback: () => HTMLElement | null;
}): React.JSX.Element | null {
  const { requestId, status, osmChoices } = request;
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const eligible = (userId: string | null) => osmChoices.some((osm) => osm.userId === userId);
  const [osmUserId, setOsmUserId] = useState(
    eligible(request.preferredOsmUserId)
      ? request.preferredOsmUserId ?? ""
      : eligible(request.currentOsmUserId) ? request.currentOsmUserId ?? "" : "",
  );
  const [scheduledAtLocal, setScheduledAtLocal] = useState(
    preferredSlotDateTimeInput(request.preferredDate, request.preferredSlot),
  );
  const [durationMinutes, setDurationMinutes] = useState(String(APPOINTMENT_DEFAULT_DURATION_MINUTES));
  const [locationDetail, setLocationDetail] = useState("");
  const [appointmentNote, setAppointmentNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const osmRef = useRef<HTMLSelectElement>(null);
  const dateTimeRef = useRef<HTMLInputElement>(null);
  const rejectionReasonRef = useRef<HTMLTextAreaElement>(null);

  if (status !== "PENDING" && status !== "APPROVED") {
    return null;
  }

  const oneOffVisit = Boolean(osmUserId && osmUserId !== request.currentOsmUserId);
  const disabled = pending || blocked;
  const confirmResult = resolvedMutation?.kind === "confirm" && resolvedMutation.requestId === requestId
    ? resolvedMutation.state
    : null;
  const rejectResult = resolvedMutation?.kind === "reject" && resolvedMutation.requestId === requestId
    ? resolvedMutation.state
    : null;
  const confirmError = confirmResult?.status === "ERROR" && !confirmResult.conflict ? confirmResult.message : null;
  const rejectError = rejectResult?.status === "ERROR" && !rejectResult.conflict ? rejectResult.message : null;
  const resolvedDecision = resolvedMutation?.requestId === requestId && resolvedMutation.kind === dialogMode
    ? resolvedMutation.state
    : null;
  const dialogResolved = resolvedDecision?.status === "SUCCESS" || (resolvedDecision?.status === "ERROR" && resolvedDecision.conflict);
  const preferredVisit = request.preferredDate && request.preferredSlot
    ? `${formatPatientServicePreferredDate(request.preferredDate)} · ${patientServiceRequestSlotLabel(request.preferredSlot)}`
    : "ไม่ระบุ";
  const selectedOsmName = osmChoices.find(({ userId }) => userId === osmUserId)?.displayName ?? "ยังไม่ได้เลือก";

  function openDialog(mode: DialogMode): void {
    onReviewOpen();
    setDialogMode(mode);
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
      <Button disabled={disabled} onClick={() => openDialog("confirm")} size="compact" type="button">
        ยืนยันนัด
      </Button>
      {status === "PENDING" ? (
        <Button disabled={disabled} onClick={() => openDialog("reject")} size="compact" type="button" variant="secondary">
          ไม่อนุมัติคำขอ
        </Button>
      ) : null}

      {dialogMode === "confirm" && !dialogResolved ? (
        <ModalDialog
          description="ตรวจสอบรายละเอียดการเยี่ยมและนัดหมาย ก่อนยืนยันเพื่อสร้างนัดหมายให้ อสม."
          dismissible={!disabled}
          footer={(
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button disabled={disabled} form={`confirm-request-${requestId}`} onClick={() => setDialogMode(null)} size="compact" type="button" variant="secondary">
                ยกเลิก
              </Button>
              <Button disabled={disabled || !osmUserId || !scheduledAtLocal || osmChoices.length === 0} form={`confirm-request-${requestId}`} size="compact" type="submit">
                ยืนยันนัดและสร้างนัดหมาย
              </Button>
            </div>
          )}
          initialFocusRef={osmRef}
          onRequestClose={() => setDialogMode(null)}
          returnFocusTarget={returnFocusToFeedback}
          size="fullscreen"
          title="ยืนยันนัดบริการ"
        >
          <div className="space-y-5">
            <dl className="grid gap-3 rounded-panel border border-border bg-surface-muted p-4 sm:grid-cols-2">
              <div><dt className="text-sm text-text-muted">ผู้ป่วย</dt><dd className="mt-1 font-semibold text-text">{request.patientName}</dd></div>
              <div><dt className="text-sm text-text-muted">โรงพยาบาล</dt><dd className="mt-1 font-semibold text-text">{request.hospitalName}</dd></div>
              <div><dt className="text-sm text-text-muted">บริการที่ขอ</dt><dd className="mt-1 text-text">{patientServiceLabel(request.serviceCode)}</dd></div>
              <div><dt className="text-sm text-text-muted">วันที่และช่วงเวลาที่ผู้ป่วยสะดวก</dt><dd className="mt-1 text-text">{preferredVisit}</dd></div>
              <div><dt className="text-sm text-text-muted">อสม. ที่ผู้ป่วยต้องการ</dt><dd className="mt-1 text-text">{request.preferredOsmName ?? "ไม่ได้ระบุ"}</dd></div>
              <div><dt className="text-sm text-text-muted">อสม. ผู้ดูแลปัจจุบัน</dt><dd className="mt-1 text-text">{request.currentOsmName ?? "ยังไม่มีผู้ดูแล"}</dd></div>
              {request.note ? <div className="sm:col-span-2"><dt className="text-sm text-text-muted">หมายเหตุจากผู้ป่วย</dt><dd className="mt-1 break-words text-text">{request.note}</dd></div> : null}
            </dl>

            <form action={confirmAction} aria-busy={pending} className="grid gap-4 sm:grid-cols-2" id={`confirm-request-${requestId}`} onSubmit={onConfirmSubmit}>
              <input name="requestId" type="hidden" value={requestId} />
              <input name="submissionNonce" type="hidden" value={submissionNonce} />
              <input name="scheduledAt" readOnly type="hidden" value={bangkokIso(scheduledAtLocal)} />
              <label className={labelClassName} htmlFor={`confirm-osm-${requestId}`}>
                <span>อสม. ผู้ไปเยี่ยม</span>
                <select
                  className={inputClassName}
                  disabled={disabled || osmChoices.length === 0}
                  id={`confirm-osm-${requestId}`}
                  name="osmUserId"
                  onChange={(event) => setOsmUserId(event.currentTarget.value)}
                  ref={osmRef}
                  required
                  value={osmUserId}
                >
                  <option value="">เลือก อสม.</option>
                  {osmChoices.map((osm) => (
                    <option key={osm.userId} value={osm.userId}>
                      {osm.userId === request.currentOsmUserId ? `${osm.displayName} (ผู้ดูแลปัจจุบัน)` : osm.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClassName} htmlFor={`confirm-at-${requestId}`}>
                <span>วันและเวลานัด (เวลาไทย)</span>
                <input
                  className={inputClassName}
                  disabled={disabled}
                  id={`confirm-at-${requestId}`}
                  onChange={(event) => setScheduledAtLocal(event.currentTarget.value)}
                  ref={dateTimeRef}
                  required
                  type="datetime-local"
                  value={scheduledAtLocal}
                />
              </label>
              {oneOffVisit ? (
                <Alert className="sm:col-span-2" variant="info">
                  <p>อสม. ที่เลือกจะปฏิบัติงานเฉพาะการเยี่ยมครั้งนี้ และนัดหมายนี้จะมอบหมายให้ อสม. คนดังกล่าว</p>
                  <p className="mt-1">ผู้ดูแลปัจจุบัน{request.currentOsmName ? ` (${request.currentOsmName})` : ""} ยังคงเดิม ระบบจะไม่เปลี่ยนผู้ดูแลของผู้ป่วย</p>
                </Alert>
              ) : null}
              {osmChoices.length === 0 ? <p className="text-sm text-text-muted sm:col-span-2">ยังไม่มี อสม. ที่ใช้งานได้ในโรงพยาบาลนี้ จึงยังยืนยันนัดไม่ได้</p> : null}
              <dl className="grid gap-3 rounded-panel border border-border bg-surface-muted p-4 sm:col-span-2 sm:grid-cols-2">
                <div><dt className="text-sm text-text-muted">อสม. ที่จะไปเยี่ยม</dt><dd aria-live="polite" className="mt-1 text-text">{selectedOsmName}</dd></div>
                <div><dt className="text-sm text-text-muted">วันและเวลานัดที่เลือก</dt><dd aria-live="polite" className="mt-1 text-text">{scheduledAtLocal ? `${scheduledAtLocal.replace("T", " ")} น. (เวลาไทย)` : "ยังไม่ได้ระบุ"}</dd></div>
                <div><dt className="text-sm text-text-muted">ระยะเวลา</dt><dd aria-live="polite" className="mt-1 text-text">{durationMinutes ? `${durationMinutes} นาที` : "ไม่ระบุ"}</dd></div>
                <div><dt className="text-sm text-text-muted">รายละเอียดสถานที่</dt><dd aria-live="polite" className="mt-1 break-words text-text">{locationDetail || "ไม่ระบุ"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-sm text-text-muted">หมายเหตุนัดหมาย</dt><dd aria-live="polite" className="mt-1 break-words text-text">{appointmentNote || "ไม่ระบุ"}</dd></div>
              </dl>
              <label className={labelClassName} htmlFor={`confirm-duration-${requestId}`}>
                <span>ระยะเวลา (นาที, ไม่บังคับ)</span>
                <input className={inputClassName} disabled={disabled} id={`confirm-duration-${requestId}`} max={480} min={5} name="durationMinutes" onChange={(event) => setDurationMinutes(event.currentTarget.value)} type="number" value={durationMinutes} />
              </label>
              <label className={labelClassName} htmlFor={`confirm-location-${requestId}`}>
                <span>รายละเอียดสถานที่ (ไม่บังคับ)</span>
                <input className={inputClassName} disabled={disabled} id={`confirm-location-${requestId}`} maxLength={500} name="locationDetail" onChange={(event) => setLocationDetail(event.currentTarget.value)} type="text" value={locationDetail} />
              </label>
              <label className={`${labelClassName} sm:col-span-2`} htmlFor={`confirm-note-${requestId}`}>
                <span>หมายเหตุนัดหมาย (ไม่บังคับ)</span>
                <textarea className={`${inputClassName} min-h-20`} disabled={disabled} id={`confirm-note-${requestId}`} maxLength={2000} name="note" onChange={(event) => setAppointmentNote(event.currentTarget.value)} value={appointmentNote} />
              </label>
              {confirmError ? <Alert className="sm:col-span-2" role="alert" variant="danger">{confirmError}</Alert> : null}
              <UnknownOutcomeAlert active={blocked && !pending} className="sm:col-span-2" recovery={{ kind: "reload" }} />
            </form>
          </div>
        </ModalDialog>
      ) : null}

      {dialogMode === "reject" && !dialogResolved && status === "PENDING" ? (
        <ModalDialog
          description="ตรวจสอบคำขอและเหตุผล ก่อนบันทึกการไม่อนุมัติ"
          dismissible={!disabled}
          footer={(
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button disabled={disabled} form={`reject-request-${requestId}`} onClick={() => setDialogMode(null)} size="compact" type="button" variant="secondary">
                ยกเลิก
              </Button>
              <Button disabled={disabled} form={`reject-request-${requestId}`} size="compact" type="submit" variant="danger">
                ไม่อนุมัติคำขอ
              </Button>
            </div>
          )}
          initialFocusRef={rejectionReasonRef}
          onRequestClose={() => setDialogMode(null)}
          returnFocusTarget={returnFocusToFeedback}
          size="compact"
          title="ไม่อนุมัติคำขอบริการ"
        >
          <div className="space-y-4">
            <dl className="grid gap-3 rounded-panel border border-border bg-surface-muted p-4">
              <div><dt className="text-sm text-text-muted">ผู้ป่วย</dt><dd className="mt-1 font-semibold text-text">{request.patientName}</dd></div>
              <div><dt className="text-sm text-text-muted">โรงพยาบาล</dt><dd className="mt-1 text-text">{request.hospitalName}</dd></div>
              <div><dt className="text-sm text-text-muted">บริการที่ขอ</dt><dd className="mt-1 text-text">{patientServiceLabel(request.serviceCode)}</dd></div>
            </dl>
            <Alert variant="warning">
              <p>เมื่อยืนยัน คำขอนี้จะถูกบันทึกเป็นไม่อนุมัติและไม่ดำเนินการนัดหมายจากคำขอนี้ต่อ</p>
              <p className="mt-1">เหตุผลที่ระบุด้านล่างจะแสดงให้ผู้ป่วยเห็น คำขอยังคงอยู่ในประวัติและจะไม่ถูกลบ</p>
            </Alert>
            <form action={rejectAction} aria-busy={pending} className="space-y-3" id={`reject-request-${requestId}`} onSubmit={onRejectSubmit}>
              <input name="requestId" type="hidden" value={requestId} />
              <label className={labelClassName} htmlFor={`reject-reason-${requestId}`}>
                <span>เหตุผลที่ไม่อนุมัติ (ผู้ป่วยจะเห็นข้อความนี้)</span>
                <textarea
                  className={`${inputClassName} min-h-24`}
                  disabled={disabled}
                  id={`reject-reason-${requestId}`}
                  maxLength={PATIENT_SERVICE_REQUEST_REJECTION_REASON_MAX_LENGTH}
                  name="reason"
                  onChange={(event) => setRejectionReason(event.currentTarget.value)}
                  ref={rejectionReasonRef}
                  required
                  value={rejectionReason}
                />
              </label>
              {rejectError ? <Alert role="alert" variant="danger">{rejectError}</Alert> : null}
              <UnknownOutcomeAlert active={blocked && !pending} recovery={{ kind: "reload" }} />
            </form>
          </div>
        </ModalDialog>
      ) : null}
    </div>
  );
}
