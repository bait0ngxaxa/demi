"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { WorkforceDetail } from "@/modules/workforce/services/workforce-service";
import {
  initialWorkforceOsmRelationshipMutationActionState,
  type WorkforceOsmRelationshipMutationActionState,
} from "@/modules/workforce/transport/action-state";
import {
  restoreOsmRelationshipAction,
  suspendOsmRelationshipAction,
} from "@/modules/workforce/transport/server-actions";

type OsmRelationshipControlsProps = {
  accountStatus: WorkforceDetail["accountStatus"];
  actions: WorkforceDetail["actions"];
  currentAssignmentCount: number;
  expectedUpdatedAt: string;
  lifecycleBlockReason: WorkforceDetail["lifecycleBlockReason"];
  relationshipId: string;
  relationshipStatus: WorkforceDetail["relationshipStatus"];
  targetHospitalId: string;
};

function Feedback({
  states,
}: {
  states: readonly WorkforceOsmRelationshipMutationActionState[];
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
      บันทึกการเปลี่ยนแปลงความสัมพันธ์ อสม. เรียบร้อยแล้ว
    </Alert>
  ) : null;
}

function BlockedReason({
  accountStatus,
  currentAssignmentCount,
  lifecycleBlockReason,
  relationshipStatus,
}: Pick<
  OsmRelationshipControlsProps,
  "accountStatus" | "currentAssignmentCount" | "lifecycleBlockReason" | "relationshipStatus"
>): React.JSX.Element {
  if (accountStatus !== "ACTIVE") {
    return (
      <Alert variant="warning">
        <p className="font-semibold">ยังไม่มีการดำเนินการด้านความสัมพันธ์</p>
        <p className="mt-1">
          บัญชีผู้ใช้งานยังไม่อยู่ในสถานะ ACTIVE จึงไม่สามารถระงับหรือคืนสถานะความสัมพันธ์ อสม. ได้
        </p>
      </Alert>
    );
  }

  if (lifecycleBlockReason === "MISSING_OSM_ROLE") {
    return (
      <Alert variant="warning">
        <p className="font-semibold">ไม่สามารถยืนยันบทบาท อสม. ของบัญชีนี้ได้</p>
        <p className="mt-1">ระบบจึงปิดการเปลี่ยนสถานะความสัมพันธ์ไว้ก่อน กรุณาตรวจสอบข้อมูลในระบบ</p>
      </Alert>
    );
  }

  if (currentAssignmentCount > 0) {
    return (
      <Alert variant="warning">
        <p className="font-semibold">
          OSM รายนี้ยังรับผิดชอบผู้ป่วย {currentAssignmentCount} ราย
        </p>
        <p className="mt-1">
          กรุณาจัดการผู้รับผิดชอบผู้ป่วยก่อน
          {relationshipStatus === "SUSPENDED" ? "คืนสถานะความสัมพันธ์" : "ระงับความสัมพันธ์"}
        </p>
      </Alert>
    );
  }

  if (lifecycleBlockReason === "INVALID_RELATIONSHIP_STATE") {
    return (
      <Alert variant="neutral">
        <p className="font-semibold">ไม่มีการดำเนินการสำหรับสถานะความสัมพันธ์นี้</p>
        <p className="mt-1">กรุณาตรวจสอบสถานะล่าสุดแล้วโหลดหน้านี้ใหม่</p>
      </Alert>
    );
  }

  return (
    <Alert variant="neutral">
      <p className="font-semibold">ไม่มีการดำเนินการสำหรับสถานะนี้</p>
      <p className="mt-1">กรุณาตรวจสอบสถานะล่าสุดแล้วโหลดหน้านี้ใหม่</p>
    </Alert>
  );
}

export function OsmRelationshipControls({
  accountStatus,
  actions,
  currentAssignmentCount,
  expectedUpdatedAt,
  lifecycleBlockReason,
  relationshipId,
  relationshipStatus,
  targetHospitalId,
}: OsmRelationshipControlsProps): React.JSX.Element {
  const router = useRouter();
  const [suspendState, suspendAction, suspendPending] = useActionState<
    WorkforceOsmRelationshipMutationActionState,
    FormData
  >(suspendOsmRelationshipAction, initialWorkforceOsmRelationshipMutationActionState);
  const [restoreState, restoreAction, restorePending] = useActionState<
    WorkforceOsmRelationshipMutationActionState,
    FormData
  >(restoreOsmRelationshipAction, initialWorkforceOsmRelationshipMutationActionState);
  const pending = suspendPending || restorePending;

  useEffect(() => {
    if (suspendState.status === "SUCCESS" || restoreState.status === "SUCCESS") {
      router.refresh();
    }
  }, [restoreState, router, suspendState]);

  if (
    !actions.suspend &&
    !actions.restore &&
    (accountStatus !== "ACTIVE" || currentAssignmentCount > 0 || lifecycleBlockReason !== null)
  ) {
    return (
      <div>
        <BlockedReason
          accountStatus={accountStatus}
          currentAssignmentCount={currentAssignmentCount}
          lifecycleBlockReason={lifecycleBlockReason}
          relationshipStatus={relationshipStatus}
        />
        <Feedback states={[suspendState, restoreState]} />
      </div>
    );
  }

  return (
    <Panel>
      <h2 className="text-xl font-semibold tracking-[-0.02em]">การจัดการความสัมพันธ์ อสม.</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        การดำเนินการมีผลเฉพาะความสัมพันธ์ อสม. กับโรงพยาบาลนี้ บัญชีผู้ใช้งาน บทบาท และข้อมูลผู้ป่วยจะไม่ถูกเปลี่ยน
      </p>

      {actions.suspend ? (
        <form action={suspendAction} className="mt-6 border-t border-border pt-5">
          <input name="relationshipId" type="hidden" value={relationshipId} />
          <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            ระงับได้เมื่อไม่มีผู้ป่วยที่ยังรับผิดชอบอยู่ในโรงพยาบาลนี้
          </p>
          <Button
            className="mt-3"
            disabled={pending}
            onClick={(event) => {
              if (!window.confirm("ยืนยันการระงับความสัมพันธ์ อสม. กับโรงพยาบาลนี้หรือไม่")) {
                event.preventDefault();
              }
            }}
            size="compact"
            type="submit"
            variant="danger"
          >
            {suspendPending ? "กำลังระงับ..." : "ระงับความสัมพันธ์ อสม."}
          </Button>
        </form>
      ) : null}

      {actions.restore ? (
        <form action={restoreAction} className="mt-5 border-t border-border pt-5">
          <input name="relationshipId" type="hidden" value={relationshipId} />
          <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            คืนสถานะเฉพาะความสัมพันธ์นี้ โดยไม่สร้างหรือคืน assignment ผู้ป่วยเดิม
          </p>
          <Button className="mt-3" disabled={pending} size="compact" type="submit">
            {restorePending ? "กำลังคืนสถานะ..." : "คืนสถานะความสัมพันธ์ อสม."}
          </Button>
        </form>
      ) : null}

      <Feedback states={[suspendState, restoreState]} />
    </Panel>
  );
}
