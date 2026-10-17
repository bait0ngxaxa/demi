"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
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

import {
  classifyWorkforceState,
  formString,
  ScopedMutationFeedback,
  standardNotice,
  useScopedMutation,
  useScopedMutationSession,
  workforceStateMessage,
} from "../../scoped-mutation";
import { HospitalOwnerGovernanceControls } from "./hospital-owner-governance-controls";

const professionLabels = {
  DOCTOR: "แพทย์",
  NURSE: "พยาบาล",
  COORDINATOR: "ผู้ประสานงาน",
  OTHER: "อื่น ๆ",
} as const;

const membershipRefusals = {
  conflict: "สถานะสมาชิกเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด",
  forbidden: "ไม่มีสิทธิ์จัดการสมาชิกโรงพยาบาลนี้",
};
const professionNotice = standardNotice({ success: "บันทึกวิชาชีพแล้ว", ...membershipRefusals });
const suspendNotice = standardNotice({ success: "ระงับสมาชิกโรงพยาบาลแล้ว", ...membershipRefusals });
const restoreNotice = standardNotice({ success: "คืนสถานะสมาชิกโรงพยาบาลแล้ว", ...membershipRefusals });

type MembershipResult = Extract<WorkforceMembershipMutationActionState, { status: "SUCCESS" }>["result"];

/** A success counts only for this relationship and only when it carries the state the submission asked for. */
function membershipConfirms(
  state: WorkforceMembershipMutationActionState,
  formData: FormData,
  expected: (result: MembershipResult) => boolean,
): boolean {
  return (
    state.status === "SUCCESS" &&
    state.result.relationshipId === formString(formData, "relationshipId") &&
    state.result.hospitalId === formString(formData, "targetHospitalId") &&
    expected(state.result)
  );
}

function membershipUpdatedAt(state: WorkforceMembershipMutationActionState): string | null {
  return state.status === "SUCCESS" ? state.result.updatedAt : null;
}

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
  const session = useScopedMutationSession<WorkforceMembershipMutationActionState>({
    scope: relationshipId,
    snapshot: expectedUpdatedAt,
    refreshOnSuccess: true,
  });
  const updateProfession = useScopedMutation(session, {
    kind: "profession",
    action: updateHospitalMembershipProfessionAction,
    initialState: initialWorkforceMembershipMutationActionState,
    classify: (state, formData) =>
      classifyWorkforceState(
        state,
        membershipConfirms(state, formData, (result) => result.profession === formString(formData, "profession")),
      ),
    notice: professionNotice,
    message: workforceStateMessage,
    resultSnapshot: membershipUpdatedAt,
  });
  const suspend = useScopedMutation(session, {
    kind: "suspend",
    action: suspendHospitalMembershipAction,
    initialState: initialWorkforceMembershipMutationActionState,
    classify: (state, formData) =>
      classifyWorkforceState(
        state,
        membershipConfirms(state, formData, (result) => result.membershipStatus === "SUSPENDED"),
      ),
    notice: suspendNotice,
    message: workforceStateMessage,
    resultSnapshot: membershipUpdatedAt,
  });
  const restore = useScopedMutation(session, {
    kind: "restore",
    action: restoreHospitalMembershipAction,
    initialState: initialWorkforceMembershipMutationActionState,
    classify: (state, formData) =>
      classifyWorkforceState(
        state,
        membershipConfirms(state, formData, (result) => result.membershipStatus === "ACTIVE"),
      ),
    notice: restoreNotice,
    message: workforceStateMessage,
    resultSnapshot: membershipUpdatedAt,
  });
  const pending = updateProfession.pending || suspend.pending || restore.pending;
  const locked = pending || session.locked;
  const latest = session.latest;
  const latestSuspend = latest?.kind === "suspend" && latest.scope === relationshipId ? latest : null;
  const suspendOutcome =
    !latestSuspend || latestSuspend.status === "PENDING"
      ? "idle"
      : latestSuspend.status === "UNCONFIRMED"
        ? "unknown"
        : latestSuspend.status === "SUCCESS"
          ? "success"
          : "error";

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

  if (membershipType === "OWNER") {
    return (
      <div className="space-y-6">
        {ownerControls}
        <Alert variant="neutral">
          <p className="font-semibold">ความสัมพันธ์เจ้าของโรงพยาบาล</p>
          <p className="mt-1">การแก้ไขวิชาชีพหรือระงับความสัมพันธ์ของเจ้าของโรงพยาบาลจัดการจากขั้นตอนเฉพาะ</p>
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
            บัญชีนี้ยังไม่พร้อมใช้งาน จึงไม่สามารถเปลี่ยนวิชาชีพ ระงับ หรือคืนสถานะได้
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

        <UnknownOutcomeAlert
          active={session.unconfirmed && latest?.kind !== "suspend"}
          className="mt-4"
          recovery={{ kind: "reload" }}
        />
        {actions.updateProfession ? (
          <form action={updateProfession.action} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
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
            <Button disabled={locked} loading={updateProfession.pending} size="compact" type="submit">
              {updateProfession.pending ? "กำลังบันทึก..." : "บันทึกวิชาชีพ"}
            </Button>
          </form>
        ) : null}

        {actions.suspend ? (
          <ConfirmableActionForm
            action={suspend.action}
            className="mt-6 border-t border-border pt-5"
            confirmation={{
              title: "ระงับความสัมพันธ์บุคลากรนี้หรือไม่",
              description: "การระงับมีผลเฉพาะความสัมพันธ์กับโรงพยาบาลนี้",
              details: <p>ความสัมพันธ์กับโรงพยาบาลอื่นและบัญชีผู้ใช้งานจะคงเดิม</p>,
              confirmLabel: "ระงับความสัมพันธ์",
              confirmVariant: "destructive",
            }}
            outcome={suspendOutcome}
            pending={pending}
            resultKey={latestSuspend}
          >
            <input name="relationshipId" type="hidden" value={relationshipId} />
            <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
            <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
            <p className="text-sm leading-6 text-text-muted">
              ระงับเฉพาะความสัมพันธ์ของบุคลากรกับโรงพยาบาลนี้ ความสัมพันธ์กับโรงพยาบาลอื่นและบัญชีผู้ใช้งานจะคงเดิม
            </p>
            <Button
              className="mt-3"
              disabled={locked}
              loading={suspend.pending}
              size="compact"
              type="submit"
              variant="danger"
            >
              {suspend.pending ? "กำลังระงับ..." : "ระงับความสัมพันธ์"}
            </Button>
          </ConfirmableActionForm>
        ) : null}

        {actions.restore ? (
          <form action={restore.action} className="mt-5 border-t border-border pt-5">
            <input name="relationshipId" type="hidden" value={relationshipId} />
            <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
            <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
            <p className="text-sm leading-6 text-text-muted">
              คืนสถานะเฉพาะความสัมพันธ์นี้ บัญชีต้องพร้อมใช้งานอยู่แล้ว
            </p>
            <Button className="mt-3" disabled={locked} loading={restore.pending} size="compact" type="submit">
              {restore.pending ? "กำลังคืนสถานะ..." : "คืนสถานะความสัมพันธ์"}
            </Button>
          </form>
        ) : null}

        <ScopedMutationFeedback session={session} success={() => "บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว"} />

        {relationshipStatus === "SUSPENDED" && !actions.restore ? (
          <p className="mt-4 text-sm leading-6 text-text-muted">สถานะนี้ไม่พร้อมให้คืนสถานะจากหน้าปัจจุบัน</p>
        ) : null}
      </Panel>
    </div>
  );
}
