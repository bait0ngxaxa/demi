"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { APPOINTMENT_DEFAULT_DURATION_MINUTES } from "@/modules/appointments/domain/appointment-definitions";
import { PATIENT_SERVICE_REQUEST_REJECTION_REASON_MAX_LENGTH } from "@/modules/patient-service-requests/domain/patient-service-definitions";
import { preferredSlotDateTimeInput } from "@/modules/patient-service-requests/presentation/patient-service-request-presentation";
import type { HospitalPatientServiceRequestView } from "@/modules/patient-service-requests/services/patient-service-request-service";

const inputClassName = "min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";
const labelClassName = "block space-y-1 text-sm font-semibold text-text";

function bangkokIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+07:00` : "";
}

/**
 * ADR-0023 (SR-D1): "ยืนยันนัด" books the home visit (PENDING, or a legacy APPROVED request); "ไม่อนุมัติ"
 * needs a reason. Any ACTIVE อสม. of the Hospital may be chosen; another than the assigned one visits once.
 */
export function HospitalPatientServiceRequestReviewControls({
  request,
  submissionNonce,
  confirmAction,
  rejectAction,
  pending,
  blocked = false,
}: {
  request: HospitalPatientServiceRequestView;
  /** Server-issued, so a retry of the same confirmation books the same appointment. */
  submissionNonce: string;
  confirmAction: (formData: FormData) => void;
  rejectAction: (formData: FormData) => void;
  pending: boolean;
  /** Set while an earlier review has an unconfirmed outcome. */
  blocked?: boolean;
}): React.JSX.Element | null {
  const { requestId, status, osmChoices } = request;
  const eligible = (userId: string | null) => osmChoices.some((osm) => osm.userId === userId);
  const [osmUserId, setOsmUserId] = useState(
    eligible(request.preferredOsmUserId)
      ? request.preferredOsmUserId ?? ""
      : eligible(request.currentOsmUserId) ? request.currentOsmUserId ?? "" : "",
  );
  const [scheduledAtLocal, setScheduledAtLocal] = useState(
    preferredSlotDateTimeInput(request.preferredDate, request.preferredSlot),
  );
  if (status !== "PENDING" && status !== "APPROVED") {
    return null;
  }
  const oneOffVisit = Boolean(osmUserId && osmUserId !== request.currentOsmUserId);
  const disabled = pending || blocked;

  return (
    <div className="mt-4 space-y-5 border-t border-border pt-4">
      <p className="text-sm leading-6 text-text-muted" id={`review-help-${requestId}`}>
        ยืนยันนัดเยี่ยมบ้านเพื่อสร้างนัดหมายและแจ้ง อสม. ผู้ไปเยี่ยม การเลือก อสม. ที่ไม่ใช่ผู้ดูแลปัจจุบันเป็นการเยี่ยมครั้งนี้เท่านั้น ไม่เปลี่ยนผู้ดูแลของผู้ป่วย
      </p>
      <form action={confirmAction} aria-busy={pending} aria-describedby={`review-help-${requestId}`} className="grid gap-4 sm:grid-cols-2">
        <input name="requestId" type="hidden" value={requestId} />
        <input name="submissionNonce" type="hidden" value={submissionNonce} />
        <input name="scheduledAt" readOnly type="hidden" value={bangkokIso(scheduledAtLocal)} />
        <label className={labelClassName} htmlFor={`confirm-at-${requestId}`}>
          <span>วันและเวลานัด</span>
          <input
            className={inputClassName}
            disabled={disabled}
            id={`confirm-at-${requestId}`}
            onChange={(event) => setScheduledAtLocal(event.currentTarget.value)}
            required
            type="datetime-local"
            value={scheduledAtLocal}
          />
        </label>
        <label className={labelClassName} htmlFor={`confirm-osm-${requestId}`}>
          <span>อสม. ผู้ไปเยี่ยม</span>
          <select
            className={inputClassName}
            disabled={disabled || osmChoices.length === 0}
            id={`confirm-osm-${requestId}`}
            name="osmUserId"
            onChange={(event) => setOsmUserId(event.currentTarget.value)}
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
        {osmChoices.length === 0 ? (
          <p className="text-sm text-text-muted sm:col-span-2">ยังไม่มี อสม. ที่ใช้งานได้ในโรงพยาบาลนี้ จึงยังยืนยันนัดไม่ได้</p>
        ) : null}
        {oneOffVisit ? (
          <p className="text-sm leading-6 text-text-muted sm:col-span-2">
            เยี่ยมครั้งเดียว: อสม. ที่เลือกเห็นเฉพาะนัดนี้ ผู้ดูแลปัจจุบัน{request.currentOsmName ? ` (${request.currentOsmName})` : ""} ไม่เปลี่ยน
          </p>
        ) : null}
        <label className={labelClassName} htmlFor={`confirm-duration-${requestId}`}>
          <span>ระยะเวลา (นาที, ไม่บังคับ)</span>
          <input
            className={inputClassName}
            defaultValue={APPOINTMENT_DEFAULT_DURATION_MINUTES}
            disabled={disabled}
            id={`confirm-duration-${requestId}`}
            max={480}
            min={5}
            name="durationMinutes"
            type="number"
          />
        </label>
        <label className={labelClassName} htmlFor={`confirm-location-${requestId}`}>
          <span>รายละเอียดสถานที่ (ไม่บังคับ)</span>
          <input className={inputClassName} disabled={disabled} id={`confirm-location-${requestId}`} maxLength={500} name="locationDetail" type="text" />
        </label>
        <label className={`${labelClassName} sm:col-span-2`} htmlFor={`confirm-note-${requestId}`}>
          <span>หมายเหตุนัดหมาย (ไม่บังคับ)</span>
          <textarea className={`${inputClassName} min-h-20`} disabled={disabled} id={`confirm-note-${requestId}`} maxLength={2000} name="note" />
        </label>
        <div className="sm:col-span-2">
          <Button disabled={disabled || !osmUserId || !scheduledAtLocal} size="compact" type="submit">
            ยืนยันนัด
          </Button>
        </div>
      </form>

      {status === "PENDING" ? (
        <form action={rejectAction} aria-busy={pending} className="space-y-2 border-t border-border pt-4">
          <input name="requestId" type="hidden" value={requestId} />
          <label className={labelClassName} htmlFor={`reject-reason-${requestId}`}>
            <span>เหตุผลที่ไม่อนุมัติ (ผู้ป่วยจะเห็นข้อความนี้)</span>
            <textarea
              className={`${inputClassName} min-h-20`}
              disabled={disabled}
              id={`reject-reason-${requestId}`}
              maxLength={PATIENT_SERVICE_REQUEST_REJECTION_REASON_MAX_LENGTH}
              name="reason"
              required
            />
          </label>
          <Button disabled={disabled} size="compact" type="submit" variant="secondary">
            ไม่อนุมัติคำขอ
          </Button>
        </form>
      ) : null}
    </div>
  );
}
