"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { APPOINTMENT_STATUS_LABELS } from "@/modules/appointments/domain/appointment-definitions";
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
  canComplete?: boolean;
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
  canComplete = canManage,
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

  if (!canManage) {
    return null;
  }

  return (
    <div>
      {status === "SCHEDULED" ? <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {canComplete ? <form action={completeAction}>
          <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            loading={completePending}
            onClick={(event) => {
              if (!window.confirm("ยืนยันว่าต้องการทำเครื่องหมายนัดหมายนี้ว่าเสร็จสิ้นหรือไม่")) {
                event.preventDefault();
              }
            }}
            type="submit"
          >
            {completePending ? "กำลังบันทึก..." : "ทำเครื่องหมายว่าเสร็จสิ้น"}
          </Button>
        </form> : null}

        {canComplete ? <form action={noShowAction}>
          <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <Button className="w-full sm:w-auto" disabled={pending} loading={noShowPending} type="submit" variant="secondary">
            {noShowPending ? "กำลังบันทึก..." : "ทำเครื่องหมายว่าไม่มาตามนัด"}
          </Button>
        </form> : null}

        <form action={cancelAction}>
          <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            loading={cancelPending}
            onClick={(event) => {
              if (!window.confirm("ยืนยันว่าต้องการยกเลิกนัดหมายนี้หรือไม่")) {
                event.preventDefault();
              }
            }}
            type="submit"
            variant="danger"
          >
            {cancelPending ? "กำลังยกเลิก..." : "ยกเลิกนัดหมาย"}
          </Button>
        </form>
      </div> : <p className="text-sm text-text-muted">นัดหมายนี้เป็นประวัติผลนัด ไม่มีการเปลี่ยนสถานะหรือเลื่อนนัด</p>}
      {[cancelState, completeState, noShowState].map((state, index) => state.status === "SUCCESS" ? (
        <Alert className="mt-4" key={index} variant="success">บันทึกสถานะนัดหมายแล้ว: {APPOINTMENT_STATUS_LABELS[state.result.status]}</Alert>
      ) : null)}
      <ErrorFeedback states={[cancelState, completeState, noShowState]} />
    </div>
  );
}

