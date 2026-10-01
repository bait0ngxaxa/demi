"use client";

import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientServiceCode, PatientServiceRequestStatus } from "@prisma/client";
import {
  formatPatientServiceRequestDate,
  patientServiceLabel,
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
};

export function PatientServiceRequestForm({
  relationshipId,
  offerings,
  osmChoices,
}: {
  relationshipId: string;
  offerings: readonly PatientServiceOfferingOption[];
  osmChoices: readonly PatientOsmOption[];
}): React.JSX.Element {
  const [state, action, pending] = useActionState(
    createPatientServiceRequestAction,
    initialPatientServiceMutationActionState,
  );

  return (
    <form action={action} className="mt-5 space-y-4">
      <input name="relationshipId" type="hidden" value={relationshipId} />
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-text" htmlFor={`service-${relationshipId}`}>
          บริการที่ต้องการ
        </label>
        <Select defaultValue="" disabled={pending} id={`service-${relationshipId}`} name="offeringId" required>
          <option disabled value="">เลือกบริการ</option>
          {offerings.map((offering) => (
            <option key={offering.offeringId} value={offering.offeringId}>
              {patientServiceLabel(offering.code)}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-text" htmlFor={`preferred-osm-${relationshipId}`}>
          อสม.ที่ต้องการ <span className="font-normal text-text-muted">(เป็นความประสงค์)</span>
        </label>
        <Select
          defaultValue=""
          disabled={pending}
          id={`preferred-osm-${relationshipId}`}
          name="preferredOsmRelationshipId"
        >
          <option value="">ให้โรงพยาบาลจัดผู้ดูแลให้</option>
          {osmChoices.map((osm) => (
            <option key={osm.relationshipId} value={osm.relationshipId}>
              {osm.displayName}
            </option>
          ))}
        </Select>
        <p className="text-sm leading-6 text-text-muted">
          โรงพยาบาลจะพิจารณาผู้ดูแลจริงภายหลัง ตัวเลือกนี้ยังไม่ใช่การมอบหมาย อสม.
        </p>
      </div>

      {state.status === "SUCCESS" ? (
        <Alert variant="success">
          <p className="font-semibold">ส่งคำขอแล้ว</p>
          <p className="mt-1">สถานะปัจจุบัน: รอโรงพยาบาลตรวจสอบ</p>
        </Alert>
      ) : null}
      {state.status === "ERROR" ? <Alert variant="danger">{state.message}</Alert> : null}

      <Button disabled={pending} loading={pending} type="submit">
        {pending ? "กำลังส่งคำขอ..." : "ส่งคำขอเพิ่มบริการ"}
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
  const [state, action, pending] = useActionState(
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
        <Button disabled={pending} loading={pending} size="compact" variant="secondary" type="submit">
          {pending ? "กำลังถอนคำขอ..." : "ถอนคำขอ"}
        </Button>
      </form>
      {state.status === "SUCCESS" ? (
        <p className="mt-2 text-sm text-success" role="status">ถอนคำขอแล้ว</p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p>
      ) : null}
    </div>
  );
}

export function PatientServiceRequestHistoryItem({
  request,
}: {
  request: {
    requestId: string;
    serviceCode: PatientServiceCode;
    status: PatientServiceRequestStatus;
    preferredOsmName: string | null;
    createdAt: Date;
  };
}): React.JSX.Element {
  return (
    <li className="border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-text">{patientServiceLabel(request.serviceCode)}</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            ผู้ดูแลที่ต้องการ (ความประสงค์): {request.preferredOsmName ?? "ให้โรงพยาบาลจัดผู้ดูแลให้"}
          </p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            ส่งคำขอเมื่อ {formatPatientServiceRequestDate(request.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <StatusBadge variant={patientServiceRequestStatusVariant(request.status)}>
            {patientServiceRequestStatusLabel(request.status)}
          </StatusBadge>
          <WithdrawPatientServiceRequestButton requestId={request.requestId} status={request.status} />
        </div>
      </div>
    </li>
  );
}
