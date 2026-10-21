"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  initialPatientProgramRoundActionState,
  type PatientProgramRoundActionState,
} from "@/modules/patient-program-rounds/transport/action-state";
import { recordPatientProgramRoundReviewAction } from "@/modules/patient-program-rounds/transport/server-actions";

export function RoundReviewButton({
  label,
  nextHref = null,
  patientHospitalRelationshipId,
  patientProgramId,
  roundNumber,
  submissionNonce,
  toolCode,
}: {
  label: string;
  /** SR-D7: inside the stepper a confirmed review moves on to the next step. */
  nextHref?: string | null;
  patientHospitalRelationshipId: string;
  patientProgramId: string;
  roundNumber: number;
  submissionNonce: string;
  toolCode: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramRoundActionState, FormData>(
    recordPatientProgramRoundReviewAction,
    initialPatientProgramRoundActionState,
  );

  useEffect(() => {
    if (state.status === "SUCCESS" && nextHref) {
      router.push(nextHref);
      return;
    }

    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [nextHref, router, state]);

  return (
    <form action={action} className="space-y-2">
      <input name="patientHospitalRelationshipId" type="hidden" value={patientHospitalRelationshipId} />
      <input name="patientProgramId" type="hidden" value={patientProgramId} />
      <input name="roundNumber" type="hidden" value={roundNumber} />
      <input name="toolCode" type="hidden" value={toolCode} />
      <input name="submissionNonce" type="hidden" value={submissionNonce} />
      <Button disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit" variant="secondary">
        {pending ? "กำลังบันทึก…" : label}
      </Button>
      {state.status === "ERROR" ? (
        <Alert variant={state.code === "CONFLICT" ? "warning" : "danger"}>{state.message}</Alert>
      ) : null}
      {state.status === "SUCCESS" ? <Alert variant="success">บันทึกการทบทวนแล้ว</Alert> : null}
      <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
    </form>
  );
}
