"use client";

import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  initialPatientServiceMutationActionState,
} from "@/modules/patient-service-requests/transport/action-state";
import { reviewPatientServiceRequestAction } from "@/modules/patient-service-requests/transport/server-actions";

export function HospitalPatientServiceRequestReviewControls({
  requestId,
  status,
}: {
  requestId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "STARTED" | "WITHDRAWN";
}): React.JSX.Element {
  const [state, action, pending] = useActionState(
    reviewPatientServiceRequestAction,
    initialPatientServiceMutationActionState,
  );

  if (status === "PENDING") {
    return (
      <div className="mt-4">
        <form action={action} className="flex flex-wrap gap-2">
          <input name="requestId" type="hidden" value={requestId} />
          <Button disabled={pending} loading={pending} name="decision" size="compact" type="submit" value="APPROVE">
            อนุมัติคำขอ
          </Button>
          <Button disabled={pending} name="decision" size="compact" type="submit" value="REJECT" variant="danger">
            ไม่อนุมัติ
          </Button>
        </form>
        {state.status === "SUCCESS" ? <p className="mt-2 text-sm text-success" role="status">บันทึกผลแล้ว</p> : null}
        {state.status === "ERROR" ? <Alert className="mt-3" variant="danger">{state.message}</Alert> : null}
      </div>
    );
  }

  if (status === "APPROVED") {
    return (
      <div className="mt-4">
        <form action={action}>
          <input name="requestId" type="hidden" value={requestId} />
          <Button disabled={pending} loading={pending} name="decision" size="compact" type="submit" value="START">
            ยืนยันว่าเริ่มให้บริการแล้ว
          </Button>
        </form>
        {state.status === "SUCCESS" ? <p className="mt-2 text-sm text-success" role="status">บันทึกสถานะเริ่มบริการแล้ว</p> : null}
        {state.status === "ERROR" ? <Alert className="mt-3" variant="danger">{state.message}</Alert> : null}
      </div>
    );
  }

  return <></>;
}
