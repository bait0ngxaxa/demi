"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { HospitalPatientServiceRequestView } from "@/modules/patient-service-requests/services/patient-service-request-service";

export function HospitalPatientServiceRequestReviewControls({
  requestId,
  status,
  action,
  pending,
  blocked = false,
  preferredOsmUserId,
  currentOsmUserId,
  currentOsmName,
  osmChoices,
}: {
  requestId: string;
  status: HospitalPatientServiceRequestView["status"];
  action: (formData: FormData) => void;
  pending: boolean;
  /** Set while an earlier review has an unconfirmed outcome. */
  blocked?: boolean;
  preferredOsmUserId: string | null;
  currentOsmUserId: string | null;
  currentOsmName: string | null;
  osmChoices: HospitalPatientServiceRequestView["osmChoices"];
}): React.JSX.Element | null {
  const preferredIsEligible = osmChoices.some(({ userId }) => userId === preferredOsmUserId);
  const [selectedOsmUserId, setSelectedOsmUserId] = useState(preferredIsEligible ? preferredOsmUserId ?? "" : "");
  const [confirmReassignment, setConfirmReassignment] = useState(false);
  if (status !== "PENDING") {
    return null;
  }
  const needsReassignmentConfirmation = Boolean(currentOsmUserId && selectedOsmUserId && currentOsmUserId !== selectedOsmUserId);
  const inputClassName = "min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-3 text-sm leading-6 text-text-muted" id={`review-help-${requestId}`}>
        อนุมัติพร้อมเลือก อสม. ผู้ดูแล ระบบจะมอบหมายและแจ้งผู้ดูแลในรายการเดียวกัน หากเปลี่ยนผู้ดูแลปัจจุบันต้องยืนยันก่อน
      </p>
      <form action={action} aria-busy={pending} aria-describedby={`review-help-${requestId}`} className="flex flex-wrap gap-2">
        <input name="requestId" type="hidden" value={requestId} />
        <label className="w-full max-w-xl text-sm font-semibold text-text" htmlFor={`review-osm-${requestId}`}>
          อสม. ผู้ดูแล
        </label>
        <select
          className={inputClassName}
          disabled={pending || blocked || osmChoices.length === 0}
          id={`review-osm-${requestId}`}
          name="osmUserId"
          onChange={(event) => {
            setSelectedOsmUserId(event.currentTarget.value);
            setConfirmReassignment(false);
          }}
          value={selectedOsmUserId}
        >
          <option value="">เลือก อสม. ผู้ดูแล</option>
          {osmChoices.map((osm) => (
            <option key={osm.userId} value={osm.userId}>{osm.displayName}</option>
          ))}
        </select>
        {osmChoices.length === 0 ? (
          <p className="w-full text-sm text-text-muted">ยังไม่มี อสม. ที่ใช้งานได้ในโรงพยาบาลนี้ จึงยังอนุมัติคำขอไม่ได้</p>
        ) : null}
        {currentOsmUserId ? (
          <p className="w-full text-sm leading-6 text-text-muted">
            ผู้ดูแลปัจจุบัน: {currentOsmName ?? "อสม. ผู้ดูแล"}
          </p>
        ) : null}
        {needsReassignmentConfirmation ? (
          <label className="flex w-full items-start gap-3 rounded-control border border-border p-3 text-sm leading-6 text-text">
            <input
              checked={confirmReassignment}
              className="mt-1 size-4 accent-action-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              name="confirmReassignment"
              onChange={(event) => setConfirmReassignment(event.currentTarget.checked)}
              required
              type="checkbox"
              value="true"
            />
            <span>ยืนยันเปลี่ยนผู้ดูแลจาก {currentOsmName ?? "อสม. ปัจจุบัน"} เป็นผู้ดูแลที่เลือก</span>
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending || blocked || !selectedOsmUserId || (needsReassignmentConfirmation && !confirmReassignment)} name="decision" size="compact" type="submit" value="APPROVE">
            อนุมัติและมอบหมาย
          </Button>
          <Button disabled={pending || blocked} name="decision" size="compact" type="submit" value="REJECT" variant="secondary">
            ไม่อนุมัติคำขอ
          </Button>
        </div>
      </form>
    </div>
  );
}
