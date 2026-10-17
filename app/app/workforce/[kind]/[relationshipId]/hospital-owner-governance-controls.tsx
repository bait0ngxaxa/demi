"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { Panel } from "@/components/ui/panel";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { WorkforceDetail } from "@/modules/workforce/services/workforce-service";
import {
  demoteHospitalOwnerAction,
  promoteHospitalOwnerAction,
} from "@/modules/workforce/transport/server-actions";
import {
  initialWorkforceOwnerGovernanceMutationActionState,
  type WorkforceOwnerGovernanceMutationActionState,
} from "@/modules/workforce/transport/action-state";

import {
  classifyWorkforceState,
  formString,
  ScopedMutationFeedback,
  standardNotice,
  useScopedMutation,
  useScopedMutationSession,
  workforceStateMessage,
} from "../../scoped-mutation";

const ownerRefusals = {
  conflict: "สิทธิ์เจ้าของเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด",
  forbidden: "ไม่มีสิทธิ์จัดการสิทธิ์เจ้าของโรงพยาบาล",
};
const promoteNotice = standardNotice({ success: "กำหนดสิทธิ์เจ้าของโรงพยาบาลแล้ว", ...ownerRefusals });
const demoteNotice = standardNotice({ success: "เปลี่ยนสิทธิ์เจ้าของโรงพยาบาลแล้ว", ...ownerRefusals });

/** A success counts only for this relationship and only when it carries the membership type that was requested. */
function ownerConfirms(
  state: WorkforceOwnerGovernanceMutationActionState,
  formData: FormData,
  membershipType: "OWNER" | "MEMBER",
): boolean {
  return (
    state.status === "SUCCESS" &&
    state.result.relationshipId === formString(formData, "relationshipId") &&
    state.result.hospitalId === formString(formData, "targetHospitalId") &&
    state.result.membershipType === membershipType
  );
}

function ownerUpdatedAt(state: WorkforceOwnerGovernanceMutationActionState): string | null {
  return state.status === "SUCCESS" ? state.result.updatedAt : null;
}

type HospitalOwnerGovernanceControlsProps = {
  accountStatus: WorkforceDetail["accountStatus"];
  expectedUpdatedAt: string;
  membershipType: WorkforceDetail["membershipType"];
  ownerGovernance: WorkforceDetail["ownerGovernance"];
  relationshipId: string;
  relationshipStatus: WorkforceDetail["relationshipStatus"];
  targetHospitalId: string;
};

export function HospitalOwnerGovernanceControls({
  accountStatus,
  expectedUpdatedAt,
  membershipType,
  ownerGovernance,
  relationshipId,
  relationshipStatus,
  targetHospitalId,
}: HospitalOwnerGovernanceControlsProps): React.JSX.Element | null {
  const session = useScopedMutationSession<WorkforceOwnerGovernanceMutationActionState>({
    scope: relationshipId,
    snapshot: expectedUpdatedAt,
    refreshOnSuccess: true,
  });
  const promote = useScopedMutation(session, {
    kind: "promote",
    action: promoteHospitalOwnerAction,
    initialState: initialWorkforceOwnerGovernanceMutationActionState,
    classify: (state, formData) => classifyWorkforceState(state, ownerConfirms(state, formData, "OWNER")),
    notice: promoteNotice,
    message: workforceStateMessage,
    resultSnapshot: ownerUpdatedAt,
  });
  const demote = useScopedMutation(session, {
    kind: "demote",
    action: demoteHospitalOwnerAction,
    initialState: initialWorkforceOwnerGovernanceMutationActionState,
    classify: (state, formData) => classifyWorkforceState(state, ownerConfirms(state, formData, "MEMBER")),
    notice: demoteNotice,
    message: workforceStateMessage,
    resultSnapshot: ownerUpdatedAt,
  });
  const pending = promote.pending || demote.pending;
  const locked = pending || session.locked;
  const latest = session.latest;
  const latestDemote = latest?.kind === "demote" && latest.scope === relationshipId ? latest : null;
  const demoteOutcome =
    !latestDemote || latestDemote.status === "PENDING"
      ? "idle"
      : latestDemote.status === "UNCONFIRMED"
        ? "unknown"
        : latestDemote.status === "SUCCESS"
          ? "success"
          : "error";
  const isActiveTarget =
    accountStatus === "ACTIVE" && relationshipStatus === "ACTIVE";

  if (membershipType !== "MEMBER" && membershipType !== "OWNER") {
    return null;
  }

  if (!isActiveTarget && !ownerGovernance.canPromote && !ownerGovernance.canDemote) {
    return null;
  }

  return (
    <Panel>
      <h2 className="text-xl font-semibold tracking-[-0.02em]">การจัดการเจ้าของโรงพยาบาล</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        การเปลี่ยนแปลงนี้มีผลเฉพาะบทบาทในโรงพยาบาลนี้ ไม่เปลี่ยนสถานะบัญชี ข้อมูลเข้าสู่ระบบ หรือความสัมพันธ์อื่น
      </p>

      <UnknownOutcomeAlert
        active={session.unconfirmed && latest?.kind !== "demote"}
        className="mt-4"
        recovery={{ kind: "reload" }}
      />
      {ownerGovernance.canPromote ? (
        <form action={promote.action} className="mt-6 border-t border-border pt-5">
          <input name="relationshipId" type="hidden" value={relationshipId} />
          <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            เปลี่ยนสมาชิกที่พร้อมใช้งานรายนี้เป็นเจ้าของโรงพยาบาลนี้
          </p>
          <Button className="mt-3" disabled={locked} loading={promote.pending} size="compact" type="submit">
            {promote.pending ? "กำลังบันทึก..." : "เปลี่ยนเป็นเจ้าของโรงพยาบาล"}
          </Button>
        </form>
      ) : null}

      {ownerGovernance.canDemote ? (
        <ConfirmableActionForm
          action={demote.action}
          className="mt-6 border-t border-border pt-5"
          confirmation={{
            title: "เปลี่ยนเจ้าของโรงพยาบาลรายนี้เป็นสมาชิกหรือไม่",
            description: "ความสัมพันธ์กับโรงพยาบาลนี้จะคงอยู่ แต่สิทธิ์เจ้าของจะถูกนำออก",
            details: <p>ระบบต้องเหลือเจ้าของโรงพยาบาลที่มีสิทธิ์อย่างน้อยหนึ่งราย</p>,
            confirmLabel: "เปลี่ยนเป็นสมาชิก",
          }}
          outcome={demoteOutcome}
          pending={pending}
          resultKey={latestDemote}
        >
          <input name="relationshipId" type="hidden" value={relationshipId} />
          <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            เปลี่ยนเป็นสมาชิก และคงความสัมพันธ์กับโรงพยาบาลนี้ไว้ ระบบต้องมีเจ้าของโรงพยาบาลที่มีสิทธิ์อย่างน้อยหนึ่งราย
          </p>
          <Button
            className="mt-3"
            disabled={locked}
            loading={demote.pending}
            size="compact"
            type="submit"
            variant="secondary"
          >
            {demote.pending ? "กำลังบันทึก..." : "เปลี่ยนเป็นสมาชิก"}
          </Button>
        </ConfirmableActionForm>
      ) : null}

      {membershipType === "OWNER" && isActiveTarget && !ownerGovernance.canDemote ? (
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ยังไม่สามารถเปลี่ยนเจ้าของโรงพยาบาลรายนี้เป็นสมาชิกได้</p>
          <p className="mt-1">ต้องเหลือเจ้าของโรงพยาบาลที่มีสิทธิ์อย่างน้อยหนึ่งราย</p>
        </Alert>
      ) : null}

      <ScopedMutationFeedback session={session} success={() => "บันทึกบทบาทเจ้าของโรงพยาบาลเรียบร้อยแล้ว"} />
    </Panel>
  );
}
