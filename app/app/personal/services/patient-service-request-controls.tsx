"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { AssigneeSearchPicker, type AssigneeOption } from "@/components/assignee/assignee-search-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm, type ConfirmableActionOutcome } from "@/components/ui/confirmable-action-form";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { PatientServiceRequestStatusView } from "@/modules/patient-service-requests/services/patient-service-request-service";
import type { PatientServiceCode, PatientServiceRequestSlot } from "@prisma/client";
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
import { SavedRecordActions, SavedRecordCard } from "../saved-record-card";
import {
  createPatientServiceRequestAction,
  searchOwnServiceRequestOsmChoicesAction,
  withdrawOwnPatientServiceRequestAction,
} from "@/modules/patient-service-requests/transport/server-actions";

/** SR-D3: the patient's assigned อสม. (by their Hospital relationship id), offered first. */
type PatientAssignedOsm = {
  relationshipId: string;
  displayName: string;
};

const NO_PREFERRED_OSM = "ไม่ระบุ — ให้โรงพยาบาลจัดให้";

const SLOT_OPTIONS: readonly PatientServiceRequestSlot[] = ["MORNING", "AFTERNOON", "ANY"];

const inputClassName =
  "min-h-12 w-full rounded-control border border-border bg-surface px-4 py-2.5 text-base text-text outline-none focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted";

/** Shown beside a service that already has an open request; the server's duplicate check stays authoritative. */
export const OPEN_SERVICE_REQUEST_OPTION_NOTE = "มีคำขอที่รอดำเนินการอยู่แล้ว";

export function PatientServiceRequestForm({
  relationshipId,
  services,
  openServiceCodes = [],
  assignedOsm,
  preferredDateBounds,
}: {
  relationshipId: string;
  /** ADR-0029: the native DEMI services, in display order. */
  services: readonly PatientServiceCode[];
  /** Services with a PENDING or APPROVED request at this Hospital. */
  openServiceCodes?: readonly PatientServiceCode[];
  assignedOsm: PatientAssignedOsm | null;
  preferredDateBounds: { min: string; max: string };
}): React.JSX.Element {
  const assignedOption: AssigneeOption | null = assignedOsm
    ? { id: assignedOsm.relationshipId, displayName: assignedOsm.displayName }
    : null;
  // The assigned อสม. is preselected, as before; the Hospital's other อสม. are searched on the server.
  const [preferredOsm, setPreferredOsm] = useState<AssigneeOption | null>(assignedOption);
  const pickerFormId = `${useId()}-osm-picker`;
  const open = new Set(openServiceCodes);
  const [state, action, pending, unknownOutcome] = useMutationActionState(
    createPatientServiceRequestAction,
    initialPatientServiceMutationActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  // A new successful result resets the chosen อสม. with the rest of the form (adjusted while rendering).
  const [resetForState, setResetForState] = useState(state);
  if (resetForState !== state) {
    setResetForState(state);
    if (state.status === "SUCCESS") {
      setPreferredOsm(assignedOption);
    }
  }

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
        <Select defaultValue="" disabled={pending || unknownOutcome} id={`service-${relationshipId}`} name="serviceCode" required>
          <option disabled value="">เลือกบริการ</option>
          {services.map((code) => (
            <option disabled={open.has(code)} key={code} value={code}>
              {open.has(code) ? `${patientServiceLabel(code)} (${OPEN_SERVICE_REQUEST_OPTION_NOTE})` : patientServiceLabel(code)}
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
        <p className="block text-sm font-semibold text-text" id={`preferred-osm-${relationshipId}`}>
          อสม.ที่ต้องการ <span className="font-normal text-text-muted">(ไม่บังคับ)</span>
        </p>
        <input name="preferredOsmRelationshipId" readOnly type="hidden" value={preferredOsm?.id ?? ""} />
        <AssigneeSearchPicker
          disabled={pending || unknownOutcome}
          formId={pickerFormId}
          hospitalId={relationshipId}
          inputName={`preferred-osm-${relationshipId}`}
          noneOption={NO_PREFERRED_OSM}
          onSelect={setPreferredOsm}
          pinned={assignedOption ? { option: assignedOption, label: "อสม. ผู้ดูแลของคุณ" } : null}
          search={(query, page) => searchOwnServiceRequestOsmChoicesAction(relationshipId, query, page)}
          searchLabel="ค้นหา อสม. ท่านอื่นของโรงพยาบาล"
          selected={preferredOsm}
          variant="osm"
        />
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
  request,
  hospitalName,
  returnFocusTarget,
}: {
  request: PatientServiceRequestStatusView;
  hospitalName: string;
  returnFocusTarget: () => HTMLElement | null;
}): React.JSX.Element {
  const [state, action, pending, unknownOutcome] = useMutationActionState(
    withdrawOwnPatientServiceRequestAction,
    initialPatientServiceMutationActionState,
  );
  const resultRef = useRef<HTMLParagraphElement>(null);
  const canWithdraw = request.status === "PENDING" || request.status === "APPROVED";
  const outcome: ConfirmableActionOutcome = unknownOutcome
    ? "unknown"
    : state.status === "SUCCESS" ? "success" : state.status === "ERROR" ? "error" : "idle";
  const preferredVisit = request.preferredDate && request.preferredSlot
    ? `${formatPatientServicePreferredDate(request.preferredDate)} · ${patientServiceRequestSlotLabel(request.preferredSlot)}`
    : "ไม่ระบุ";

  if (!canWithdraw) {
    return <></>;
  }

  return (
    <div>
      <ConfirmableActionForm
        action={action}
        confirmation={{
          title: "ถอนคำขอบริการนี้หรือไม่",
          description: `ตรวจสอบคำขอรับบริการประเภท${patientServiceLabel(request.serviceCode)} จาก ${hospitalName} ก่อนยืนยัน`,
          details: (
            <>
              <dl className="grid gap-2 rounded-panel border border-border bg-surface-muted p-4">
                <div><dt className="text-sm">บริการ</dt><dd className="font-semibold text-text">{patientServiceLabel(request.serviceCode)}</dd></div>
                <div><dt className="text-sm">โรงพยาบาล</dt><dd className="font-semibold text-text">{hospitalName}</dd></div>
                <div><dt className="text-sm">วันที่และช่วงเวลาที่สะดวก</dt><dd className="font-semibold text-text">{preferredVisit}</dd></div>
              </dl>
              <Alert variant="warning">
                <p>เมื่อยืนยัน คำขอนี้จะเปลี่ยนเป็นถอนแล้ว และโรงพยาบาลจะไม่ดำเนินการคำขอนี้ต่อ</p>
                <p className="mt-1">การถอนคำขอไม่ใช่การยกเลิกนัดหมายที่สร้างแล้ว</p>
              </Alert>
            </>
          ),
          confirmLabel: "ยืนยันถอนคำขอ",
          pendingLabel: "กำลังถอนคำขอ...",
          confirmVariant: "destructive",
        }}
        outcome={outcome}
        pending={pending}
        resultKey={state}
        returnFocusTarget={() => state.status === "IDLE" && !unknownOutcome ? null : resultRef.current ?? returnFocusTarget()}
      >
        <input name="requestId" type="hidden" value={request.requestId} />
        {state.status !== "SUCCESS" ? (
          <Button disabled={pending || unknownOutcome} loading={pending} size="compact" variant="secondary" type="submit">
            ถอนคำขอ
          </Button>
        ) : null}
      </ConfirmableActionForm>
      {state.status === "SUCCESS" ? (
        <p className="mt-2 text-sm text-success focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" ref={resultRef} role="status" tabIndex={-1}>ถอนคำขอแล้ว</p>
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
  hospitalName,
}: {
  request: PatientServiceRequestStatusView;
  hospitalName: string;
}): React.JSX.Element {
  const itemRef = useRef<HTMLLIElement>(null);
  const appointmentHref = request.status === "STARTED" && request.appointmentId
    ? `/app/personal/appointments/${encodeURIComponent(request.relationshipId)}/${encodeURIComponent(request.appointmentId)}`
    : null;
  const hasActions = appointmentHref !== null || request.status === "PENDING" || request.status === "APPROVED";

  return (
    <li className="min-w-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" ref={itemRef} tabIndex={-1}>
      <SavedRecordCard>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h4 className="break-words font-semibold text-text">{patientServiceLabel(request.serviceCode)}</h4>
          <StatusBadge variant={patientServiceRequestStatusVariant(request.status)}>
            {patientServiceRequestStatusLabel(request.status)}
          </StatusBadge>
        </div>
        <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-sm font-semibold text-text-muted">อสม. ที่ต้องการ</dt>
            <dd className="mt-1 break-words text-text">{request.preferredOsmName ?? "ให้โรงพยาบาลจัดให้"}</dd>
          </div>
          {request.preferredDate && request.preferredSlot ? (
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-text-muted">วันที่และช่วงเวลาที่สะดวก</dt>
              <dd className="mt-1 break-words text-text">
                <time dateTime={request.preferredDate}>{formatPatientServicePreferredDate(request.preferredDate)}</time>
                {" · "}{patientServiceRequestSlotLabel(request.preferredSlot)}
              </dd>
            </div>
          ) : null}
          {request.note ? <div className="min-w-0 sm:col-span-2">
            <dt className="text-sm font-semibold text-text-muted">หมายเหตุถึงโรงพยาบาล</dt>
            <dd className="mt-1 break-words text-text">{request.note}</dd>
          </div> : null}
          {request.rejectionReason ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-sm font-semibold text-text-muted">เหตุผลที่ไม่อนุมัติ</dt>
              <dd className="mt-1 break-words text-text">{request.rejectionReason}</dd>
            </div>
          ) : null}
          <div className="min-w-0">
            <dt className="text-sm font-semibold text-text-muted">ส่งคำขอเมื่อ</dt>
            <dd className="mt-1 text-text"><time dateTime={request.createdAt.toISOString()}>{formatPatientServiceRequestDate(request.createdAt)}</time></dd>
          </div>
        </dl>
        {hasActions ? <SavedRecordActions>
          {appointmentHref ? <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong px-4 text-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={appointmentHref} prefetch={false}>ดูนัดหมาย</Link> : null}
          <WithdrawPatientServiceRequestButton hospitalName={hospitalName} request={request} returnFocusTarget={() => itemRef.current} />
        </SavedRecordActions> : null}
      </SavedRecordCard>
    </li>
  );
}
