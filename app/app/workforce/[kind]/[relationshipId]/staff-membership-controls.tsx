"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import type { WorkforceDetail } from "@/modules/workforce/services/workforce-service";
import {
  initialWorkforceMembershipMutationActionState,
  type WorkforceMembershipMutationActionState,
} from "@/modules/workforce/transport/action-state";
import {
  restoreHospitalMembershipAction,
  suspendHospitalMembershipAction,
  updateHospitalMembershipProfessionAction,
} from "@/modules/workforce/transport/server-actions";

import { HospitalOwnerGovernanceControls } from "./hospital-owner-governance-controls";

const professionLabels = {
  DOCTOR: "แพทย์",
  NURSE: "พยาบาล",
  COORDINATOR: "ผู้ประสานงาน",
  OTHER: "อื่น ๆ",
} as const;

type StaffMembershipControlsProps = {
  accountStatus: WorkforceDetail["accountStatus"];
  actions: WorkforceDetail["actions"];
  expectedUpdatedAt: string;
  membershipType: WorkforceDetail["membershipType"];
  ownerGovernance: WorkforceDetail["ownerGovernance"];
  profession: WorkforceDetail["profession"];
  relationshipId: string;
  relationshipStatus: WorkforceDetail["relationshipStatus"];
  targetHospitalId: string;
};

function Feedback({
  states,
}: {
  states: readonly WorkforceMembershipMutationActionState[];
}): React.JSX.Element | null {
  const errorState = states.find((state) => state.status === "ERROR");

  if (errorState && errorState.status === "ERROR") {
    return (
      <Alert className="mt-4" variant={errorState.code === "CONFLICT" ? "warning" : "danger"}>
        {errorState.message}
      </Alert>
    );
  }

  const successState = states.find((state) => state.status === "SUCCESS");

  return successState ? (
    <Alert className="mt-4" variant="success">
      บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว
    </Alert>
  ) : null;
}

export function StaffMembershipControls({
  accountStatus,
  actions,
  expectedUpdatedAt,
  membershipType,
  ownerGovernance,
  profession,
  relationshipId,
  relationshipStatus,
  targetHospitalId,
}: StaffMembershipControlsProps): React.JSX.Element {
  const router = useRouter();
  const [professionState, professionAction, professionPending] = useActionState<
    WorkforceMembershipMutationActionState,
    FormData
  >(updateHospitalMembershipProfessionAction, initialWorkforceMembershipMutationActionState);
  const [suspendState, suspendAction, suspendPending] = useActionState<
    WorkforceMembershipMutationActionState,
    FormData
  >(suspendHospitalMembershipAction, initialWorkforceMembershipMutationActionState);
  const [restoreState, restoreAction, restorePending] = useActionState<
    WorkforceMembershipMutationActionState,
    FormData
  >(restoreHospitalMembershipAction, initialWorkforceMembershipMutationActionState);
  const pending = professionPending || suspendPending || restorePending;

  const ownerControls = (
    <HospitalOwnerGovernanceControls
      accountStatus={accountStatus}
      expectedUpdatedAt={expectedUpdatedAt}
      membershipType={membershipType}
      ownerGovernance={ownerGovernance}
      relationshipId={relationshipId}
      relationshipStatus={relationshipStatus}
      targetHospitalId={targetHospitalId}
    />
  );

  useEffect(() => {
    if (
      professionState.status === "SUCCESS" ||
      suspendState.status === "SUCCESS" ||
      restoreState.status === "SUCCESS"
    ) {
      router.refresh();
    }
  }, [professionState, restoreState, router, suspendState]);

  if (membershipType === "OWNER") {
    return (
      <div className="space-y-6">
        {ownerControls}
        <Alert variant="neutral">
          <p className="font-semibold">ความสัมพันธ์เจ้าของโรงพยาบาล</p>
          <p className="mt-1">การแก้ไขวิชาชีพหรือระงับความสัมพันธ์ OWNER อยู่นอกขอบเขตต้นแบบนี้</p>
        </Alert>
      </div>
    );
  }

  if (accountStatus !== "ACTIVE") {
    return (
      <div className="space-y-6">
        {ownerControls}
        <Alert variant="warning">
          <p className="font-semibold">ยังไม่มีการดำเนินการด้านความสัมพันธ์</p>
          <p className="mt-1">
            บัญชีผู้ใช้งานยังไม่อยู่ในสถานะ ACTIVE จึงไม่สามารถเปลี่ยนวิชาชีพ ระงับ หรือคืนสถานะได้
          </p>
        </Alert>
      </div>
    );
  }

  if (!actions.updateProfession && !actions.suspend && !actions.restore) {
    return (
      <div className="space-y-6">
        {ownerControls}
        <Alert variant="neutral">
          <p className="font-semibold">ไม่มีการดำเนินการสำหรับสถานะนี้</p>
          <p className="mt-1">กรุณาตรวจสอบสถานะความสัมพันธ์ล่าสุดแล้วโหลดหน้านี้ใหม่</p>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ownerControls}
      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em]">การจัดการความสัมพันธ์บุคลากร</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          การดำเนินการมีผลเฉพาะความสัมพันธ์บุคลากรกับโรงพยาบาลนี้ บัญชีผู้ใช้งานจะไม่ถูกเปลี่ยนสถานะ
        </p>

        {actions.updateProfession ? (
          <form action={professionAction} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input name="relationshipId" type="hidden" value={relationshipId} />
            <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
            <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
            <label className="block max-w-sm flex-1 space-y-2 text-sm font-semibold" htmlFor="profession">
              <span>วิชาชีพ</span>
              <Select defaultValue={profession ?? ""} id="profession" name="profession" required>
                <option disabled value="">
                  เลือกวิชาชีพ
                </option>
                {Object.entries(professionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <Button disabled={pending} size="compact" type="submit">
              {professionPending ? "กำลังบันทึก..." : "บันทึกวิชาชีพ"}
            </Button>
          </form>
        ) : null}

        {actions.suspend ? (
          <form action={suspendAction} className="mt-6 border-t border-border pt-5">
            <input name="relationshipId" type="hidden" value={relationshipId} />
            <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
            <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
            <p className="text-sm leading-6 text-text-muted">
              ระงับเฉพาะความสัมพันธ์ของบุคลากรกับโรงพยาบาลนี้ ความสัมพันธ์กับโรงพยาบาลอื่นและบัญชีผู้ใช้งานจะคงเดิม
            </p>
            <Button
              className="mt-3"
              disabled={pending}
              onClick={(event) => {
                if (!window.confirm("ยืนยันการระงับความสัมพันธ์บุคลากรกับโรงพยาบาลนี้หรือไม่")) {
                  event.preventDefault();
                }
              }}
              size="compact"
              type="submit"
              variant="danger"
            >
              {suspendPending ? "กำลังระงับ..." : "ระงับความสัมพันธ์"}
            </Button>
          </form>
        ) : null}

        {actions.restore ? (
          <form action={restoreAction} className="mt-5 border-t border-border pt-5">
            <input name="relationshipId" type="hidden" value={relationshipId} />
            <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
            <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
            <p className="text-sm leading-6 text-text-muted">
              คืนสถานะเฉพาะความสัมพันธ์นี้ บัญชีผู้ใช้งานต้องอยู่ในสถานะ ACTIVE อยู่แล้ว
            </p>
            <Button className="mt-3" disabled={pending} size="compact" type="submit">
              {restorePending ? "กำลังคืนสถานะ..." : "คืนสถานะความสัมพันธ์"}
            </Button>
          </form>
        ) : null}

        <Feedback states={[professionState, suspendState, restoreState]} />

        {relationshipStatus === "SUSPENDED" && !actions.restore ? (
          <p className="mt-4 text-sm leading-6 text-text-muted">สถานะนี้ไม่พร้อมให้คืนสถานะจากหน้าปัจจุบัน</p>
        ) : null}
      </Panel>
    </div>
  );
}
