"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  cancelAppointmentAction,
  completeAppointmentAction,
  markAppointmentNoShowAction,
} from "@/modules/appointments/transport/server-actions";
import {
  initialAppointmentActionState,
  type AppointmentActionState,
} from "@/modules/appointments/transport/action-state";

type AppointmentMutationControlsProps = {
  relationshipId: string;
  appointmentId: string;
  expectedUpdatedAt: string;
  canManage: boolean;
  status: string;
};

function ErrorFeedback({ states }: { states: readonly AppointmentActionState[] }): React.JSX.Element | null {
  const errorState = states.find((state) => state.status === "ERROR");

  if (!errorState || errorState.status !== "ERROR") {
    return null;
  }

  return (
    <Alert className="mt-4" variant={errorState.code === "CONFLICT" ? "warning" : "danger"}>
      {errorState.message}
    </Alert>
  );
}

export function AppointmentMutationControls({
  relationshipId,
  appointmentId,
  expectedUpdatedAt,
  canManage,
  status,
}: AppointmentMutationControlsProps): React.JSX.Element | null {
  const router = useRouter();
  const [cancelState, cancelAction, cancelPending] = useActionState<
    AppointmentActionState,
    FormData
  >(cancelAppointmentAction, initialAppointmentActionState);
  const [completeState, completeAction, completePending] = useActionState<
    AppointmentActionState,
    FormData
  >(completeAppointmentAction, initialAppointmentActionState);
  const [noShowState, noShowAction, noShowPending] = useActionState<
    AppointmentActionState,
    FormData
  >(markAppointmentNoShowAction, initialAppointmentActionState);
  const pending = cancelPending || completePending || noShowPending;

  useEffect(() => {
    if (
      cancelState.status === "SUCCESS" ||
      completeState.status === "SUCCESS" ||
      noShowState.status === "SUCCESS"
    ) {
      router.refresh();
    }
  }, [cancelState, completeState, noShowState, router]);

  if (!canManage || status !== "SCHEDULED") {
    return null;
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <form action={completeAction}>
          <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <Button
            disabled={pending}
            onClick={(event) => {
              if (!window.confirm("ยืนยันว่าต้องการทำเครื่องหมาย Appointment นี้ว่าเสร็จสิ้นหรือไม่")) {
                event.preventDefault();
              }
            }}
            type="submit"
          >
            ทำเครื่องหมายว่าเสร็จสิ้น
          </Button>
        </form>

        <form action={noShowAction}>
          <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <Button disabled={pending} type="submit" variant="secondary">
            ทำเครื่องหมายว่าไม่มาตามนัด
          </Button>
        </form>

        <form action={cancelAction}>
          <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <Button
            disabled={pending}
            onClick={(event) => {
              if (!window.confirm("ยืนยันว่าต้องการยกเลิก Appointment นี้หรือไม่")) {
                event.preventDefault();
              }
            }}
            type="submit"
            variant="danger"
          >
            ยกเลิก Appointment
          </Button>
        </form>
      </div>
      <ErrorFeedback states={[cancelState, completeState, noShowState]} />
    </div>
  );
}

