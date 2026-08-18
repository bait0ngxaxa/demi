"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  initialHospitalGovernanceMutationActionState,
  type HospitalGovernanceMutationActionState,
} from "@/modules/hospital-governance/transport/action-state";
import {
  restoreHospitalAction,
  suspendHospitalAction,
} from "@/modules/hospital-governance/transport/server-actions";

type HospitalGovernanceControlsProps = {
  expectedUpdatedAt: string;
  hospitalId: string;
  status: "ACTIVE" | "SUSPENDED";
};

function Feedback({
  states,
}: {
  states: readonly HospitalGovernanceMutationActionState[];
}): React.JSX.Element | null {
  const errorState = states.find((state) => state.status === "ERROR");

  if (errorState && errorState.status === "ERROR") {
    return (
      <Alert className="mt-4" role="alert" variant={errorState.code === "CONFLICT" ? "warning" : "danger"}>
        {errorState.message}
      </Alert>
    );
  }

  const successState = states.find((state) => state.status === "SUCCESS");

  return successState ? (
    <Alert className="mt-4" variant="success">
      บันทึกสถานะโรงพยาบาลเรียบร้อยแล้ว
    </Alert>
  ) : null;
}

export function HospitalGovernanceControls({
  expectedUpdatedAt,
  hospitalId,
  status,
}: HospitalGovernanceControlsProps): React.JSX.Element {
  const router = useRouter();
  const [suspendState, suspendAction, suspendPending] = useActionState<
    HospitalGovernanceMutationActionState,
    FormData
  >(suspendHospitalAction, initialHospitalGovernanceMutationActionState);
  const [restoreState, restoreAction, restorePending] = useActionState<
    HospitalGovernanceMutationActionState,
    FormData
  >(restoreHospitalAction, initialHospitalGovernanceMutationActionState);
  const pending = suspendPending || restorePending;

  useEffect(() => {
    if (suspendState.status === "SUCCESS" || restoreState.status === "SUCCESS") {
      router.refresh();
    }
  }, [restoreState, router, suspendState]);

  return (
    <Panel aria-labelledby="hospital-governance-controls-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="hospital-governance-controls-heading">
        การจัดการสถานะโรงพยาบาล
      </h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        การเปลี่ยนสถานะมีผลทันทีเมื่อบันทึกสำเร็จ และมีผลเฉพาะโรงพยาบาลนี้
      </p>

      {status === "ACTIVE" ? (
        <form
          action={suspendAction}
          className="mt-6 border-t border-border pt-5"
          onSubmit={(event) => {
            if (!window.confirm("ยืนยันการระงับโรงพยาบาลนี้หรือไม่ การดำเนินการจะปิดการใช้งานขอบเขตของโรงพยาบาลนี้")) {
              event.preventDefault();
            }
          }}
        >
          <input name="hospitalId" type="hidden" value={hospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            ขอบเขตที่อาศัย Hospital นี้จะตรวจสิทธิ์ไม่ผ่านขณะสถานะเป็น SUSPENDED โดยข้อมูลเดิมจะไม่ถูกลบหรือปรับแก้
          </p>
          <Button className="mt-3" disabled={pending} size="compact" type="submit" variant="danger">
            {suspendPending ? "กำลังระงับ..." : "ระงับโรงพยาบาล"}
          </Button>
        </form>
      ) : (
        <form action={restoreAction} className="mt-6 border-t border-border pt-5">
          <input name="hospitalId" type="hidden" value={hospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            คืนเฉพาะสถานะโรงพยาบาลเป็น ACTIVE ขอบเขตที่ยังมีสถานะและเงื่อนไขของตนเองไม่ผ่านจะยังคงถูกปฏิเสธ
          </p>
          <Button className="mt-3" disabled={pending} size="compact" type="submit">
            {restorePending ? "กำลังคืนสถานะ..." : "คืนสถานะโรงพยาบาล"}
          </Button>
        </form>
      )}

      <Feedback states={[suspendState, restoreState]} />
    </Panel>
  );
}
