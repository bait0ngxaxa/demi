"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  initialPatientProgramRoundActionState,
  type PatientProgramRoundActionState,
} from "@/modules/patient-program-rounds/transport/action-state";
import { recordPatientProgramRoundReviewAction } from "@/modules/patient-program-rounds/transport/server-actions";

export function RoundReviewButton({
  label,
  patientHospitalRelationshipId,
  patientProgramId,
  roundNumber,
  submissionNonce,
  toolCode,
}: {
  label: string;
  patientHospitalRelationshipId: string;
  patientProgramId: string;
  roundNumber: number;
  submissionNonce: string;
  toolCode: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<PatientProgramRoundActionState, FormData>(
    recordPatientProgramRoundReviewAction,
    initialPatientProgramRoundActionState,
  );

  useEffect(() => {
    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <form action={action} className="space-y-2">
      <input name="patientHospitalRelationshipId" type="hidden" value={patientHospitalRelationshipId} />
      <input name="patientProgramId" type="hidden" value={patientProgramId} />
      <input name="roundNumber" type="hidden" value={roundNumber} />
      <input name="toolCode" type="hidden" value={toolCode} />
      <input name="submissionNonce" type="hidden" value={submissionNonce} />
      <Button disabled={pending} loading={pending} size="compact" type="submit" variant="secondary">
        {pending ? "กำลังบันทึก…" : label}
      </Button>
      {state.status === "ERROR" ? (
        <Alert variant={state.code === "CONFLICT" ? "warning" : "danger"}>{state.message}</Alert>
      ) : null}
      {state.status === "SUCCESS" ? <Alert variant="success">บันทึกการทบทวนแล้ว</Alert> : null}
    </form>
  );
}
