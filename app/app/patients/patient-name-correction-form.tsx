"use client";

import { useId } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { correctPatientNameAction, type HospitalPatientEditState } from "@/modules/patient-hospital-profile/transport/hospital-patient-edit-actions";

const control = "mt-2 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

/** Customer decision E3 (ก-19): correct the Person name; the server decides OWNER vs ADMIN authority. */
export function PatientNameCorrectionForm({ relationshipId, version, givenName, familyName }: {
  relationshipId: string;
  version: number;
  givenName: string | null;
  familyName: string | null;
}): React.JSX.Element {
  const id = useId();
  const [state, formAction, pending, unknownOutcome] = useMutationActionState<HospitalPatientEditState, FormData>(
    correctPatientNameAction.bind(null, relationshipId),
    { status: "IDLE", message: "" },
  );

  return <form action={formAction} className="space-y-4" onSubmit={submitPreservingInput(formAction)}>
    <input type="hidden" name="expectedVersion" value={version} />
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-given`} className="text-sm font-semibold text-text">ชื่อ</label>
        <input id={`${id}-given`} name="givenName" className={control} defaultValue={givenName ?? ""} maxLength={120} required disabled={pending || unknownOutcome} />
      </div>
      <div>
        <label htmlFor={`${id}-family`} className="text-sm font-semibold text-text">นามสกุล</label>
        <input id={`${id}-family`} name="familyName" className={control} defaultValue={familyName ?? ""} maxLength={120} required disabled={pending || unknownOutcome} />
      </div>
    </div>
    {state.status === "ERROR" ? <Alert role="alert" variant="warning">{state.message}</Alert> : null}
    {state.status === "SUCCESS" ? <Alert variant="success">{state.message}</Alert> : null}
    <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload" }} />
    <Button disabled={unknownOutcome} loading={pending} size="compact" type="submit" variant="secondary">
      {pending ? "กำลังบันทึก…" : "บันทึกชื่อ-สกุล"}
    </Button>
  </form>;
}
