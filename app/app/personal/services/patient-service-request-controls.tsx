"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { PatientServiceRequestStatusView } from "@/modules/patient-service-requests/services/patient-service-request-service";
import type { PatientServiceCode, PatientServiceRequestSlot, PatientServiceRequestStatus } from "@prisma/client";
import { PATIENT_SERVICE_REQUEST_NOTE_MAX_LENGTH } from "@/modules/patient-service-requests/domain/patient-service-definitions";
import {
  formatPatientServicePreferredDate,
  formatPatientServiceRequestDate,
  patientServiceLabel,
  patientServiceRequestSlotLabel,
  patientServiceRequestStatusLabel,
  patientServiceRequestStatusVariant,
} from "@/modules/patient-service-requests/presentation/patient-service-request-presentation";
import {
  initialPatientServiceMutationActionState,
} from "@/modules/patient-service-requests/transport/action-state";
import {
  createPatientServiceRequestAction,
  withdrawOwnPatientServiceRequestAction,
} from "@/modules/patient-service-requests/transport/server-actions";

type PatientServiceOfferingOption = {
  offeringId: string;
  code: PatientServiceCode;
};

type PatientOsmOption = {
  relationshipId: string;
  displayName: string;
  assigned: boolean;
};

const SLOT_OPTIONS: readonly PatientServiceRequestSlot[] = ["MORNING", "AFTERNOON", "ANY"];

const inputClassName =
  "min-h-12 w-full rounded-control border border-border bg-surface px-4 py-2.5 text-base text-text outline-none focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted";

export function PatientServiceRequestForm({
  relationshipId,
  offerings,
  osmChoices,
  preferredDateBounds,
}: {
  relationshipId: string;
  offerings: readonly PatientServiceOfferingOption[];
  osmChoices: readonly PatientOsmOption[];
  preferredDateBounds: { min: string; max: string };
}): React.JSX.Element {
  const [state, action, pending, unknownOutcome] = useMutationActionState(
    createPatientServiceRequestAction,
    initialPatientServiceMutationActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "SUCCESS") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form action={action} className="mt-5 space-y-4" onSubmit={submitPreservingInput(action)} ref={formRef}>
      <input name="relationshipId" type="hidden" value={relationshipId} />
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-text" htmlFor={`service-${relationshipId}`}>
          บริการที่ต้องการ
        </label>
        <Select defaultValue="" disabled={pending || unknownOutcome} id={`service-${relationshipId}`} name="offeringId" required>
          <option disabled value="">เลือกบริการ</option>
          {offerings.map((offering) => (
            <option key={offering.offeringId} value={offering.offeringId}>
              {patientServiceLabel(offering.code)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor={`preferred-date-${relationshipId}`}>
            วันที่สะดวก
          </label>
          <input
            className={inputClassName}
            disabled={pending || unknownOutcome}
            id={`preferred-date-${relationshipId}`}
            max={preferredDateBounds.max}
            min={preferredDateBounds.min}
            name="preferredDate"
            required
            type="date"
          />
          <p className="text-sm leading-6 text-text-muted">เลือกได้ตั้งแต่พรุ่งนี้ถึง 60 วันข้างหน้า</p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor={`preferred-slot-${relationshipId}`}>
            ช่วงเวลาที่สะดวก
          </label>
          <Select defaultValue="" disabled={pending || unknownOutcome} id={`preferred-slot-${relationshipId}`} name="preferredSlot" required>
            <option disabled value="">เลือกช่วงเวลา</option>
            {SLOT_OPTIONS.map((slot) => (
              <option key={slot} value={slot}>{patientServiceRequestSlotLabel(slot)}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-text" htmlFor={`preferred-osm-${relationshipId}`}>
          อสม.ที่ต้องการ <span className="font-normal text-text-muted">(ไม่บังคับ)</span>
        </label>
        <Select
          defaultValue={osmChoices.find((osm) => osm.assigned)?.relationshipId ?? ""}
          disabled={pending || unknownOutcome}
          id={`preferred-osm-${relationshipId}`}
          name="preferredOsmRelationshipId"
        >
          <option value="">ไม่ระบุ — ให้โรงพยาบาลจัดให้</option>
          {osmChoices.map((osm) => (
            <option key={osm.relationshipId} value={osm.relationshipId}>
              {osm.assigned ? `${osm.displayName} (อสม. ผู้ดูแลของคุณ)` : osm.displayName}
            </option>
          ))}
        </Select>
        <p className="text-sm leading-6 text-text-muted">
          โรงพยาบาลเป็นผู้ยืนยัน อสม. ที่ไปเยี่ยม การเลือก อสม. ท่านอื่นเป็นการเยี่ยมครั้งนี้เท่านั้น ไม่เปลี่ยนผู้ดูแลของคุณ
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-text" htmlFor={`note-${relationshipId}`}>
          หมายเหตุถึงโรงพยาบาล <span className="font-normal text-text-muted">(ไม่บังคับ)</span>
        </label>
        <textarea
          className={`${inputClassName} min-h-24 py-3`}
          disabled={pending || unknownOutcome}
          id={`note-${relationshipId}`}
          maxLength={PATIENT_SERVICE_REQUEST_NOTE_MAX_LENGTH}
          name="note"
        />
      </div>

      {state.status === "SUCCESS" ? (
        <Alert variant="success">
          <p className="font-semibold">ส่งคำขอแล้ว</p>
          <p className="mt-1">สถานะปัจจุบัน: รอโรงพยาบาลยืนยัน โรงพยาบาลจะยืนยันวันเวลานัดให้</p>
        </Alert>
      ) : null}
      {state.status === "ERROR" ? <Alert variant="danger">{state.message}</Alert> : null}
      <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "review", label: "ตรวจสอบรายการคำขอล่าสุด" }} />

      <Button disabled={pending || unknownOutcome} loading={pending} type="submit">
        {pending ? "กำลังส่งคำขอ..." : "ส่งคำขอรับบริการ"}
      </Button>
    </form>
  );
}

export function WithdrawPatientServiceRequestButton({
  requestId,
  status,
}: {
  requestId: string;
  status: PatientServiceRequestStatus;
}): React.JSX.Element {
  const [state, action, pending, unknownOutcome] = useMutationActionState(
    withdrawOwnPatientServiceRequestAction,
    initialPatientServiceMutationActionState,
  );
  const canWithdraw = status === "PENDING" || status === "APPROVED";

  if (!canWithdraw) {
    return <></>;
  }

  return (
    <div className="mt-3">
      <form action={action}>
        <input name="requestId" type="hidden" value={requestId} />
        <Button disabled={pending || unknownOutcome} loading={pending} size="compact" variant="secondary" type="submit">
          {pending ? "กำลังถอนคำขอ..." : "ถอนคำขอ"}
        </Button>
      </form>
      {state.status === "SUCCESS" ? (
        <p className="mt-2 text-sm text-success" role="status">ถอนคำขอแล้ว</p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p>
      ) : null}
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-2" recovery={{ kind: "reload" }} />
    </div>
  );
}

export function PatientServiceRequestHistoryItem({
  request,
}: {
  request: PatientServiceRequestStatusView;
}): React.JSX.Element {
  return (
    <li className="border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-text">{patientServiceLabel(request.serviceCode)}</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            อสม. ที่ต้องการ: {request.preferredOsmName ?? "ให้โรงพยาบาลจัดให้"}
          </p>
          {request.preferredDate && request.preferredSlot ? (
            <p className="mt-1 text-sm leading-6 text-text-muted">
              วันที่สะดวก: {formatPatientServicePreferredDate(request.preferredDate)} · {patientServiceRequestSlotLabel(request.preferredSlot)}
            </p>
          ) : null}
          {request.note ? <p className="mt-1 break-words text-sm leading-6 text-text-muted">หมายเหตุ: {request.note}</p> : null}
          {request.rejectionReason ? (
            <p className="mt-1 break-words text-sm leading-6 text-text">เหตุผลที่ไม่อนุมัติ: {request.rejectionReason}</p>
          ) : null}
          <p className="mt-1 text-sm leading-6 text-text-muted">
            ส่งคำขอเมื่อ {formatPatientServiceRequestDate(request.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <StatusBadge variant={patientServiceRequestStatusVariant(request.status)}>
            {patientServiceRequestStatusLabel(request.status)}
          </StatusBadge>
          {request.status === "STARTED" && request.appointmentId ? (
            <Link className="inline-flex min-h-11 items-center rounded-control font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/personal/appointments/${encodeURIComponent(request.relationshipId)}/${encodeURIComponent(request.appointmentId)}`} prefetch={false}>ดูนัดหมาย</Link>
          ) : null}
          <WithdrawPatientServiceRequestButton requestId={request.requestId} status={request.status} />
        </div>
      </div>
    </li>
  );
}
