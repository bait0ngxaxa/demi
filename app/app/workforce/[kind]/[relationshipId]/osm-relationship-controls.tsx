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
  conflict: "ไม่สามารถเปลี่ยนความสัมพันธ์ อสม. ได้ กรุณาตรวจสอบสถานะล่าสุด",
  forbidden: "ไม่มีสิทธิ์จัดการความสัมพันธ์ อสม. นี้",
};
const suspendNotice = standardNotice({ success: "ระงับความสัมพันธ์ อสม. แล้ว", ...osmRefusals });
const restoreNotice = standardNotice({ success: "คืนสถานะความสัมพันธ์ อสม. แล้ว", ...osmRefusals });

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
        <p className="font-semibold">ยังไม่มีการดำเนินการด้านความสัมพันธ์</p>
        <p className="mt-1">
          บัญชีนี้ยังไม่พร้อมใช้งาน จึงไม่สามารถระงับหรือคืนสถานะความสัมพันธ์ อสม. ได้
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
        <ScopedMutationFeedback session={session} success={() => "บันทึกการเปลี่ยนแปลงความสัมพันธ์ อสม. เรียบร้อยแล้ว"} />
      </div>
    );
  }

  return (
    <Panel>
      <h2 className="text-xl font-semibold tracking-[-0.02em]">การจัดการความสัมพันธ์ อสม.</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        การดำเนินการมีผลเฉพาะความสัมพันธ์ อสม. กับโรงพยาบาลนี้ บัญชีผู้ใช้งาน บทบาท และข้อมูลผู้ป่วยจะไม่ถูกเปลี่ยน
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
            title: "ระงับความสัมพันธ์ อสม. นี้หรือไม่",
            description: "การระงับมีผลเฉพาะความสัมพันธ์กับโรงพยาบาลนี้",
            details: <p>บัญชีผู้ใช้งาน บทบาท และข้อมูลผู้ป่วยจะไม่ถูกเปลี่ยน</p>,
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
            ระงับได้เมื่อไม่มีผู้ป่วยที่ยังรับผิดชอบอยู่ในโรงพยาบาลนี้
          </p>
          <Button
            className="mt-3"
            disabled={locked}
            loading={suspend.pending}
            size="compact"
            type="submit"
            variant="danger"
          >
            {suspend.pending ? "กำลังระงับ..." : "ระงับความสัมพันธ์ อสม."}
          </Button>
        </ConfirmableActionForm>
      ) : null}

      {actions.restore ? (
        <form action={restore.action} className="mt-5 border-t border-border pt-5">
          <input name="relationshipId" type="hidden" value={relationshipId} />
          <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            คืนสถานะเฉพาะความสัมพันธ์นี้ โดยไม่สร้างหรือคืนการมอบหมายผู้ป่วยเดิม
          </p>
          <Button className="mt-3" disabled={locked} loading={restore.pending} size="compact" type="submit">
            {restore.pending ? "กำลังคืนสถานะ..." : "คืนสถานะความสัมพันธ์ อสม."}
          </Button>
        </form>
      ) : null}

      <ScopedMutationFeedback session={session} success={() => "บันทึกการเปลี่ยนแปลงความสัมพันธ์ อสม. เรียบร้อยแล้ว"} />
    </Panel>
  );
}
