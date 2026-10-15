"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  completePatientProgramAction,
  openPatientProgramAction,
} from "@/modules/patient-program/transport/server-actions";
import {
  initialPatientProgramActionState,
  type PatientProgramActionState,
} from "@/modules/patient-program/transport/action-state";

function ErrorFeedback({
  state,
}: {
  state: PatientProgramActionState;
}): React.JSX.Element | null {
  if (state.status !== "ERROR") {
    return null;
  }

  return (
    <Alert className="mt-4" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
      {state.message}
    </Alert>
  );
}

export function PatientProgramOpenControl({
  relationshipId,
}: {
  relationshipId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome] = useMutationActionState<PatientProgramActionState, FormData>(
    openPatientProgramAction,
    initialPatientProgramActionState,
  );

  useEffect(() => {
    if (
      state.status === "SUCCESS" ||
      (state.status === "ERROR" && state.code === "CONFLICT")
    ) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <div>
      <form action={action}>
        <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
        <Button disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit">
          {pending ? "กำลังเปิดโปรแกรม…" : "เปิดโปรแกรม"}
        </Button>
      </form>
      <ErrorFeedback state={state} />
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-3" />
    </div>
  );
}

export function PatientProgramCompleteControl({
  programId,
}: {
  programId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome] = useMutationActionState<PatientProgramActionState, FormData>(
    completePatientProgramAction,
    initialPatientProgramActionState,
  );

  useEffect(() => {
    if (
      state.status === "SUCCESS" ||
      (state.status === "ERROR" && state.code === "CONFLICT")
    ) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <div>
      <ConfirmableActionForm
        action={action}
        confirmation={{
          title: "จบโปรแกรมนี้หรือไม่",
          description: "เมื่อจบแล้ว โปรแกรมจะเป็นประวัติอ่านอย่างเดียว และจะไม่สามารถบันทึกกิจกรรมหรือแนบหลักฐาน Service 1 เพิ่มได้",
          details: <p>การจบโปรแกรมไม่ใช่การตัดสินผลทางคลินิก</p>,
          confirmLabel: "จบโปรแกรม",
        }}
        outcome={unknownOutcome ? "unknown" : state.status === "SUCCESS" ? "success" : state.status === "ERROR" ? "error" : "idle"}
        pending={pending}
        resultKey={state}
      >
        <input name="patientProgramId" type="hidden" value={programId} />
        <Button
          disabled={pending}
          loading={pending}
          type="submit"
        >
          {pending ? "กำลังจบโปรแกรม…" : "จบโปรแกรมและเก็บเป็นประวัติ"}
        </Button>
      </ConfirmableActionForm>
      <ErrorFeedback state={state} />
    </div>
  );
}
