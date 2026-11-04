"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { Panel } from "@/components/ui/panel";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { WorkforceDetail } from "@/modules/workforce/services/workforce-service";
import {
  initialWorkforceOsmRelationshipMutationActionState,
  type WorkforceOsmRelationshipMutationActionState,
} from "@/modules/workforce/transport/action-state";
import {
  restoreOsmRelationshipAction,
  suspendOsmRelationshipAction,
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

const osmRefusals = {
  conflict: "สิทธิ์การทำงานของ อสม. เปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด",
  forbidden: "ไม่มีสิทธิ์จัดการสิทธิ์การทำงานของ อสม. รายนี้",
};
const suspendNotice = standardNotice({ success: "พักสิทธิ์ อสม. ในโรงพยาบาลนี้ชั่วคราวแล้ว", ...osmRefusals });
const restoreNotice = standardNotice({ success: "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้งแล้ว", ...osmRefusals });

/** A success counts only for this relationship and only when it carries the status the submission asked for. */
function osmConfirms(
  state: WorkforceOsmRelationshipMutationActionState,
  formData: FormData,
  status: "ACTIVE" | "SUSPENDED",
): boolean {
  return (
    state.status === "SUCCESS" &&
    state.result.relationshipId === formString(formData, "relationshipId") &&
    state.result.hospitalId === formString(formData, "targetHospitalId") &&
    state.result.relationshipStatus === status
  );
}

function osmUpdatedAt(state: WorkforceOsmRelationshipMutationActionState): string | null {
  return state.status === "SUCCESS" ? state.result.updatedAt : null;
}

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
        <p className="font-semibold">ยังเปลี่ยนสิทธิ์การทำงานไม่ได้</p>
        <p className="mt-1">
          บัญชีนี้ยังใช้งานไม่ได้ จึงยังเปลี่ยนสิทธิ์การทำงานของ อสม. ในโรงพยาบาลนี้ไม่ได้
        </p>
      </Alert>
    );
  }

  if (lifecycleBlockReason === "MISSING_OSM_ROLE") {
    return (
      <Alert variant="warning">
        <p className="font-semibold">ตรวจสอบบทบาท อสม. ของบัญชีนี้ไม่ได้</p>
        <p className="mt-1">จึงยังเปลี่ยนสิทธิ์การทำงานในโรงพยาบาลนี้ไม่ได้ กรุณาตรวจสอบข้อมูลบัญชี</p>
      </Alert>
    );
  }

  if (currentAssignmentCount > 0) {
    return (
      <Alert variant="warning">
        <p className="font-semibold">
          อสม. รายนี้ยังรับผิดชอบผู้ป่วย {currentAssignmentCount} ราย
        </p>
        <p className="mt-1">
          กรุณาเปลี่ยนผู้รับผิดชอบผู้ป่วยก่อน
          {relationshipStatus === "SUSPENDED" ? "เปิดสิทธิ์ อสม. อีกครั้ง" : "พักสิทธิ์ อสม. ชั่วคราว"}
        </p>
      </Alert>
    );
  }

  if (lifecycleBlockReason === "INVALID_RELATIONSHIP_STATE") {
    return (
      <Alert variant="neutral">
        <p className="font-semibold">ไม่มีรายการที่เปลี่ยนได้ในสถานะนี้</p>
        <p className="mt-1">กรุณาตรวจสอบสถานะการทำงานล่าสุด แล้วโหลดหน้านี้ใหม่</p>
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
  const session = useScopedMutationSession<WorkforceOsmRelationshipMutationActionState>({
    scope: relationshipId,
    snapshot: expectedUpdatedAt,
    refreshOnSuccess: true,
  });
  const suspend = useScopedMutation(session, {
    kind: "suspend",
    action: suspendOsmRelationshipAction,
    initialState: initialWorkforceOsmRelationshipMutationActionState,
    classify: (state, formData) => classifyWorkforceState(state, osmConfirms(state, formData, "SUSPENDED")),
    notice: suspendNotice,
    message: workforceStateMessage,
    resultSnapshot: osmUpdatedAt,
  });
  const restore = useScopedMutation(session, {
    kind: "restore",
    action: restoreOsmRelationshipAction,
    initialState: initialWorkforceOsmRelationshipMutationActionState,
    classify: (state, formData) => classifyWorkforceState(state, osmConfirms(state, formData, "ACTIVE")),
    notice: restoreNotice,
    message: workforceStateMessage,
    resultSnapshot: osmUpdatedAt,
  });
  const pending = suspend.pending || restore.pending;
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
        <ScopedMutationFeedback session={session} success={() => "อัปเดตสิทธิ์การทำงานของ อสม. แล้ว"} />
      </div>
    );
  }

  return (
    <Panel>
      <h2 className="text-xl font-semibold tracking-[-0.02em]">จัดการสิทธิ์การทำงานของ อสม.</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        การดำเนินการมีผลเฉพาะสิทธิ์การทำงานของ อสม. รายนี้ในโรงพยาบาลนี้ ไม่เปลี่ยนบัญชี บทบาท อสม. หรือข้อมูลผู้ป่วย
      </p>

      <UnknownOutcomeAlert
        active={session.unconfirmed && latest?.kind !== "suspend"}
        className="mt-4"
        recovery={{ kind: "reload" }}
      />
      {actions.suspend ? (
        <ConfirmableActionForm
          action={suspend.action}
          className="mt-6 border-t border-border pt-5"
          confirmation={{
            title: "พักสิทธิ์ อสม. รายนี้ชั่วคราวหรือไม่",
            description: "อสม. รายนี้จะใช้สิทธิ์ทำงานในโรงพยาบาลนี้ไม่ได้ชั่วคราว",
            details: <p>บัญชีและบทบาท อสม. จะคงเดิม การพักสิทธิ์ทำได้เมื่อไม่มีผู้ป่วยที่ยังรับผิดชอบอยู่</p>,
            confirmLabel: "พักสิทธิ์ อสม. ชั่วคราว",
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
            พักสิทธิ์ได้เมื่อ อสม. รายนี้ไม่มีผู้ป่วยที่ยังรับผิดชอบในโรงพยาบาลนี้
          </p>
          <Button
            className="mt-3"
            disabled={locked}
            loading={suspend.pending}
            size="compact"
            type="submit"
            variant="danger"
          >
            {suspend.pending ? "กำลังพักสิทธิ์ อสม. ในโรงพยาบาลนี้..." : "พักสิทธิ์ อสม. ในโรงพยาบาลนี้"}
          </Button>
        </ConfirmableActionForm>
      ) : null}

      {actions.restore ? (
        <form action={restore.action} className="mt-5 border-t border-border pt-5">
          <input name="relationshipId" type="hidden" value={relationshipId} />
          <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง ระบบจะไม่คืนผู้ป่วยที่เคยรับผิดชอบให้อัตโนมัติ
          </p>
          <Button className="mt-3" disabled={locked} loading={restore.pending} size="compact" type="submit">
            {restore.pending ? "กำลังเปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง..." : "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง"}
          </Button>
        </form>
      ) : null}

      <ScopedMutationFeedback
        session={session}
        success={(submission) => submission.kind === "suspend"
          ? "พักสิทธิ์ อสม. ในโรงพยาบาลนี้ชั่วคราวแล้ว"
          : "เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้งแล้ว"}
      />
    </Panel>
  );
}
