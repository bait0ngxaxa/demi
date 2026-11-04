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
  conflict: "สิทธิ์แอดมินโรงพยาบาลเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด",
  forbidden: "ไม่มีสิทธิ์จัดการสิทธิ์แอดมินโรงพยาบาล",
};
const promoteNotice = standardNotice({ success: "เปลี่ยนเป็นแอดมินโรงพยาบาลแล้ว", ...ownerRefusals });
const demoteNotice = standardNotice({ success: "เปลี่ยนเป็นเจ้าหน้าที่โรงพยาบาลแล้ว", ...ownerRefusals });

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
      <h2 className="text-xl font-semibold tracking-[-0.02em]">จัดการสิทธิ์แอดมินโรงพยาบาล</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        การเปลี่ยนแปลงนี้มีผลเฉพาะสิทธิ์ในโรงพยาบาลนี้ ไม่เปลี่ยนสถานะบัญชีหรือข้อมูลเข้าสู่ระบบ
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
            เปลี่ยนเจ้าหน้าที่ที่พร้อมใช้งานรายนี้เป็นแอดมินโรงพยาบาล
          </p>
          <Button className="mt-3" disabled={locked} loading={promote.pending} size="compact" type="submit">
            {promote.pending ? "กำลังเปลี่ยนเป็นแอดมินโรงพยาบาล..." : "เปลี่ยนเป็นแอดมินโรงพยาบาล"}
          </Button>
        </form>
      ) : null}

      {ownerGovernance.canDemote ? (
        <ConfirmableActionForm
          action={demote.action}
          className="mt-6 border-t border-border pt-5"
          confirmation={{
            title: "เปลี่ยนแอดมินโรงพยาบาลรายนี้เป็นเจ้าหน้าที่หรือไม่",
            description: "สิทธิ์แอดมินโรงพยาบาลของรายนี้จะสิ้นสุด แต่ยังเป็นเจ้าหน้าที่โรงพยาบาลนี้ได้",
            details: <p>โรงพยาบาลต้องมีแอดมินโรงพยาบาลที่ยังมีสิทธิ์อย่างน้อยหนึ่งคน</p>,
            confirmLabel: "เปลี่ยนเป็นเจ้าหน้าที่โรงพยาบาล",
          }}
          outcome={demoteOutcome}
          pending={pending}
          resultKey={latestDemote}
        >
          <input name="relationshipId" type="hidden" value={relationshipId} />
          <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            เปลี่ยนเป็นเจ้าหน้าที่โรงพยาบาล และคงสิทธิ์ทำงานในโรงพยาบาลนี้ไว้ โรงพยาบาลต้องมีแอดมินอย่างน้อยหนึ่งคน
          </p>
          <Button
            className="mt-3"
            disabled={locked}
            loading={demote.pending}
            size="compact"
            type="submit"
            variant="secondary"
          >
            {demote.pending ? "กำลังเปลี่ยนเป็นเจ้าหน้าที่โรงพยาบาล..." : "เปลี่ยนเป็นเจ้าหน้าที่โรงพยาบาล"}
          </Button>
        </ConfirmableActionForm>
      ) : null}

      {membershipType === "OWNER" && isActiveTarget && !ownerGovernance.canDemote ? (
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ยังเปลี่ยนแอดมินโรงพยาบาลรายนี้เป็นเจ้าหน้าที่ไม่ได้</p>
          <p className="mt-1">โรงพยาบาลต้องมีแอดมินที่ยังมีสิทธิ์อย่างน้อยหนึ่งคน</p>
        </Alert>
      ) : null}

      <ScopedMutationFeedback
        session={session}
        success={(submission) => submission.kind === "promote"
          ? "เปลี่ยนเป็นแอดมินโรงพยาบาลแล้ว"
          : "เปลี่ยนเป็นเจ้าหน้าที่โรงพยาบาลแล้ว"}
      />
    </Panel>
  );
}
