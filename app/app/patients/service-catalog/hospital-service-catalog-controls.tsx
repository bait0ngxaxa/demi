"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm, type ConfirmableActionOutcome } from "@/components/ui/confirmable-action-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { PatientServiceCode } from "@prisma/client";
import { patientServiceLabel } from "@/modules/patient-service-requests/presentation/patient-service-request-presentation";
import {
  initialPatientServiceMutationActionState,
} from "@/modules/patient-service-requests/transport/action-state";
import { setHospitalServiceOfferingAction } from "@/modules/patient-service-requests/transport/server-actions";

export function HospitalServiceOfferingControl({
  hospitalId,
  code,
  enabled,
}: {
  hospitalId: string;
  code: PatientServiceCode;
  enabled: boolean;
}): React.JSX.Element {
  const [state, action, pending, unknownOutcome] = useMutationActionState(
    setHospitalServiceOfferingAction,
    initialPatientServiceMutationActionState,
  );
  const outcome: ConfirmableActionOutcome = unknownOutcome
    ? "unknown"
    : state.status === "SUCCESS" ? "success" : state.status === "ERROR" ? "error" : "idle";
  const actionFields = (
    <>
      <input name="hospitalId" type="hidden" value={hospitalId} />
      <input name="code" type="hidden" value={code} />
      <input name="enabled" type="hidden" value={String(!enabled)} />
    </>
  );

  return (
    <div className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-text">{patientServiceLabel(code)}</p>
        <p className="mt-1 text-sm leading-6 text-text-muted">
          เปิดรับคำขอบริการประเภท{patientServiceLabel(code)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge variant={enabled ? "success" : "neutral"}>
          {enabled ? "เปิดรับคำขอ" : "ยังไม่เปิดรับ"}
        </StatusBadge>
        {enabled ? (
          <ConfirmableActionForm
            action={action}
            confirmation={{
              title: `ปิดรับคำขอบริการประเภท${patientServiceLabel(code)}`,
              description: "ตรวจสอบโรงพยาบาลและประเภทบริการก่อนยืนยัน",
              details: (
                <Alert variant="warning">
                  <p>การปิดรับคำขอจะหยุดเฉพาะการรับคำขอใหม่ประเภทนี้ใน DEMI</p>
                  <p className="mt-1">การเปลี่ยนนี้ไม่ถอนคำขอที่ส่งแล้ว ไม่ยกเลิกนัดหมาย และไม่ปิดบริการต้นทางที่โรงพยาบาลจัดให้</p>
                </Alert>
              ),
              confirmLabel: "ปิดรับคำขอ",
              pendingLabel: "กำลังปิดรับคำขอ...",
              confirmVariant: "destructive",
            }}
            outcome={outcome}
            pending={pending}
            resultKey={state}
          >
            {actionFields}
            <Button disabled={pending || unknownOutcome} loading={pending} size="compact" variant="secondary" type="submit">
              ปิดรับคำขอ
            </Button>
          </ConfirmableActionForm>
        ) : (
          <form action={action}>
            {actionFields}
            <Button disabled={pending || unknownOutcome} loading={pending} size="compact" variant="secondary" type="submit">
              เปิดรับคำขอ
            </Button>
          </form>
        )}
      </div>
      {state.status === "SUCCESS" ? (
        <p className="text-sm text-success" role="status">บันทึกสถานะบริการแล้ว</p>
      ) : null}
      {state.status === "ERROR" ? (
        <Alert className="basis-full" variant="danger">{state.message}</Alert>
      ) : null}
      <UnknownOutcomeAlert active={unknownOutcome} className="basis-full" recovery={{ kind: "reload" }} />
    </div>
  );
}
