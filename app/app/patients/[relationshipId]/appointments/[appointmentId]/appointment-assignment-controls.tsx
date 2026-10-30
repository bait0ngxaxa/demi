"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { Panel } from "@/components/ui/panel";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { acceptAppointmentAssignmentAction } from "@/modules/appointments/transport/server-actions";
import {
  initialAppointmentInteractionActionState,
  type AppointmentInteractionActionState,
} from "@/modules/appointments/transport/action-state";

type AppointmentAssignmentControlsProps = {
  relationshipId: string;
  appointmentId: string;
  expectedUpdatedAt: string;
  submissionNonce: string;
  assignedOsmDisplayName: string;
  acceptedAt: Date | null;
  canAcceptAssignment: boolean;
};

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

export function AppointmentAssignmentControls({
  relationshipId,
  appointmentId,
  expectedUpdatedAt,
  submissionNonce,
  assignedOsmDisplayName,
  acceptedAt,
  canAcceptAssignment,
}: AppointmentAssignmentControlsProps): React.JSX.Element | null {
  const router = useRouter();
  const [state, action, pending, unknownOutcome] = useMutationActionState<
    AppointmentInteractionActionState,
    FormData
  >(acceptAppointmentAssignmentAction, initialAppointmentInteractionActionState);

  useEffect(() => {
    if (state.status === "SUCCESS" && state.operation === "ASSIGNMENT_ACCEPTED") {
      router.refresh();
    }
  }, [router, state]);

  if (!assignedOsmDisplayName) return null;

  const outcome = state.status === "SUCCESS"
    ? "success"
    : state.status === "ERROR"
      ? "error"
      : unknownOutcome
        ? "unknown"
        : "idle";

  return (
    <Panel>
      <section aria-labelledby="appointment-assignment-heading" className="space-y-3">
        <h2 className="text-lg font-semibold" id="appointment-assignment-heading">การตอบรับงานของ อสม.</h2>
        <p className="text-sm leading-6 text-text-muted">อสม. ผู้รับผิดชอบนัดนี้: {assignedOsmDisplayName}</p>
        {acceptedAt ? (
          <p className="text-sm font-semibold text-text" role="status">อสม. ตอบรับนัดหมายแล้ว · {formatTime(acceptedAt)}</p>
        ) : canAcceptAssignment ? (
          <>
            <p className="text-sm leading-6 text-text-muted">ยืนยันนัดหมายนี้เพื่อรับงานเยี่ยมบ้าน กำหนดการเปลี่ยนภายหลังจะต้องตอบรับใหม่</p>
            <ConfirmableActionForm
              action={action}
              confirmation={{
                title: "ยืนยันตอบรับนัดหมายนี้หรือไม่",
                description: "ระบบจะบันทึกว่าคุณรับงานเยี่ยมบ้านตามวันและเวลาปัจจุบัน",
                confirmLabel: "ยืนยันตอบรับ",
              }}
              outcome={outcome}
              resultKey={state}
              pending={pending}
            >
              <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
              <input name="appointmentId" type="hidden" value={appointmentId} />
              <input name="sourceAppointmentUpdatedAt" type="hidden" value={expectedUpdatedAt} />
              <input name="submissionNonce" type="hidden" value={submissionNonce} />
              <Button className="w-full sm:w-auto" disabled={unknownOutcome} loading={pending} type="submit">
                {pending ? "กำลังบันทึก..." : "ตอบรับนัดหมาย"}
              </Button>
            </ConfirmableActionForm>
            {state.status === "ERROR" ? <Alert className="mt-3" variant={state.code === "CONFLICT" ? "warning" : "danger"}>{state.message}</Alert> : null}
            {state.status === "SUCCESS" ? <Alert className="mt-3" variant="success">บันทึกการตอบรับนัดหมายแล้ว</Alert> : null}
            <UnknownOutcomeAlert active={unknownOutcome} className="mt-3" recovery={{ kind: "reload" }} />
          </>
        ) : (
          <p className="text-sm text-text-muted">ยังไม่มีการตอบรับนัดหมายสำหรับกำหนดการปัจจุบัน</p>
        )}
      </section>
    </Panel>
  );
}
