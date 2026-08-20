"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  const [state, action, pending] = useActionState<PatientProgramActionState, FormData>(
    openPatientProgramAction,
    initialPatientProgramActionState,
  );

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.refresh();
    }
  }, [router, state]);

  return (
    <div>
      <form action={action}>
        <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
        <Button disabled={pending} loading={pending} size="compact" type="submit">
          {pending ? "กำลังเปิดโปรแกรม..." : "เปิดโปรแกรม"}
        </Button>
      </form>
      <ErrorFeedback state={state} />
    </div>
  );
}

export function PatientProgramCompleteControl({
  programId,
}: {
  programId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<PatientProgramActionState, FormData>(
    completePatientProgramAction,
    initialPatientProgramActionState,
  );

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.refresh();
    }
  }, [router, state]);

  return (
    <div>
      <form action={action}>
        <input name="patientProgramId" type="hidden" value={programId} />
        <Button
          disabled={pending}
          loading={pending}
          onClick={(event) => {
            if (!window.confirm("ยืนยันว่าต้องการทำเครื่องหมายว่าโปรแกรมนี้เสร็จสิ้นหรือไม่")) {
              event.preventDefault();
            }
          }}
          type="submit"
        >
          {pending ? "กำลังบันทึก..." : "ทำเครื่องหมายว่าเสร็จสิ้น"}
        </Button>
      </form>
      <ErrorFeedback state={state} />
    </div>
  );
}
