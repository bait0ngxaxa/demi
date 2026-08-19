"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { WorkforceDetail } from "@/modules/workforce/services/workforce-service";
import {
  demoteHospitalOwnerAction,
  promoteHospitalOwnerAction,
} from "@/modules/workforce/transport/server-actions";
import {
  initialWorkforceOwnerGovernanceMutationActionState,
  type WorkforceOwnerGovernanceMutationActionState,
} from "@/modules/workforce/transport/action-state";

type HospitalOwnerGovernanceControlsProps = {
  accountStatus: WorkforceDetail["accountStatus"];
  expectedUpdatedAt: string;
  membershipType: WorkforceDetail["membershipType"];
  ownerGovernance: WorkforceDetail["ownerGovernance"];
  relationshipId: string;
  relationshipStatus: WorkforceDetail["relationshipStatus"];
  targetHospitalId: string;
};

function Feedback({
  states,
}: {
  states: readonly WorkforceOwnerGovernanceMutationActionState[];
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
      บันทึกสถานะ Owner/Member เรียบร้อยแล้ว
    </Alert>
  ) : null;
}

export function HospitalOwnerGovernanceControls({
  accountStatus,
  expectedUpdatedAt,
  membershipType,
  ownerGovernance,
  relationshipId,
  relationshipStatus,
  targetHospitalId,
}: HospitalOwnerGovernanceControlsProps): React.JSX.Element | null {
  const router = useRouter();
  const [promoteState, promoteAction, promotePending] = useActionState(
    promoteHospitalOwnerAction,
    initialWorkforceOwnerGovernanceMutationActionState,
  );
  const [demoteState, demoteAction, demotePending] = useActionState(
    demoteHospitalOwnerAction,
    initialWorkforceOwnerGovernanceMutationActionState,
  );
  const pending = promotePending || demotePending;
  const isActiveTarget =
    accountStatus === "ACTIVE" && relationshipStatus === "ACTIVE";

  useEffect(() => {
    if (promoteState.status === "SUCCESS" || demoteState.status === "SUCCESS") {
      router.refresh();
    }
  }, [demoteState, promoteState, router]);

  if (membershipType !== "MEMBER" && membershipType !== "OWNER") {
    return null;
  }

  if (!isActiveTarget && !ownerGovernance.canPromote && !ownerGovernance.canDemote) {
    return null;
  }

  return (
    <Panel>
      <h2 className="text-xl font-semibold tracking-[-0.02em]">การจัดการ Owner โรงพยาบาล</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        เปลี่ยนเฉพาะประเภทสมาชิกของโรงพยาบาลนี้ ไม่เปลี่ยนสถานะบัญชี Role.HOSPITAL ข้อมูลรับรอง หรือความสัมพันธ์อื่น
      </p>

      {ownerGovernance.canPromote ? (
        <form action={promoteAction} className="mt-6 border-t border-border pt-5">
          <input name="relationshipId" type="hidden" value={relationshipId} />
          <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            เลื่อนสมาชิก ACTIVE รายนี้เป็น Owner ของโรงพยาบาลนี้เท่านั้น
          </p>
          <Button className="mt-3" disabled={pending} size="compact" type="submit">
            {promotePending ? "กำลังเลื่อนสถานะ..." : "เลื่อนเป็น Owner"}
          </Button>
        </form>
      ) : null}

      {ownerGovernance.canDemote ? (
        <form action={demoteAction} className="mt-6 border-t border-border pt-5">
          <input name="relationshipId" type="hidden" value={relationshipId} />
          <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            ลดสถานะเป็น Member และคงความสัมพันธ์ ACTIVE ไว้ ระบบต้องเหลือ Owner ที่มีสิทธิ์อย่างน้อยหนึ่งราย
          </p>
          <Button
            className="mt-3"
            disabled={pending}
            onClick={(event) => {
              if (!window.confirm("ยืนยันการลดสถานะ Owner เป็น Member หรือไม่")) {
                event.preventDefault();
              }
            }}
            size="compact"
            type="submit"
            variant="secondary"
          >
            {demotePending ? "กำลังลดสถานะ..." : "ลดสถานะเป็น Member"}
          </Button>
        </form>
      ) : null}

      {membershipType === "OWNER" && isActiveTarget && !ownerGovernance.canDemote ? (
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ยังไม่สามารถลดสถานะ Owner ได้</p>
          <p className="mt-1">การดำเนินการต้องเหลือ Owner ที่มีสิทธิ์อย่างน้อยหนึ่งราย ระบบจะตรวจสอบเงื่อนไขนี้ซ้ำที่เซิร์ฟเวอร์</p>
        </Alert>
      ) : null}

      <Feedback states={[promoteState, demoteState]} />
    </Panel>
  );
}
