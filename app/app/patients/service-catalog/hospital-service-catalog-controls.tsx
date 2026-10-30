"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
        <form action={action}>
          <input name="hospitalId" type="hidden" value={hospitalId} />
          <input name="code" type="hidden" value={code} />
          <input name="enabled" type="hidden" value={String(!enabled)} />
          <Button disabled={pending || unknownOutcome} loading={pending} size="compact" variant="secondary" type="submit">
            {pending ? "กำลังบันทึก..." : enabled ? "ปิดรับคำขอ" : "เปิดรับคำขอ"}
          </Button>
        </form>
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
