"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { dispatchFormDataPreservingInput } from "@/components/ui/mutation-action-state";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { useDialogFormDraft } from "@/components/ui/use-dialog-form-draft";
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
  conflict: "สิทธิ์การทำงานเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด",
  forbidden: "ไม่มีสิทธิ์จัดการเจ้าหน้าที่โรงพยาบาลนี้",
};
const professionNotice = standardNotice({ success: "บันทึกวิชาชีพแล้ว", ...membershipRefusals });
const suspendNotice = standardNotice({ success: "พักสิทธิ์เจ้าหน้าที่ในโรงพยาบาลนี้ชั่วคราวแล้ว", ...membershipRefusals });
const restoreNotice = standardNotice({ success: "เปิดสิทธิ์เจ้าหน้าที่ในโรงพยาบาลนี้อีกครั้งแล้ว", ...membershipRefusals });

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
  const latestProfession = latest?.kind === "profession" && latest.scope === relationshipId ? latest : null;
  const [professionSubmissionBaselineId, setProfessionSubmissionBaselineId] = useState(0);
  const currentProfessionSubmission = latestProfession && latestProfession.id > professionSubmissionBaselineId ? latestProfession : null;
  const latestSuspend = latest?.kind === "suspend" && latest.scope === relationshipId ? latest : null;
  const suspendOutcome =
    !latestSuspend || latestSuspend.status === "PENDING"
      ? "idle"
      : latestSuspend.status === "UNCONFIRMED"
        ? "unknown"
        : latestSuspend.status === "SUCCESS"
          ? "success"
          : "error";
  const [professionDialogOpen, setProfessionDialogOpen] = useState(false);
  const [professionSnapshot, setProfessionSnapshot] = useState<string | null>(null);
  const professionFormId = useId();
  const professionRef = useRef<HTMLSelectElement>(null);
  const professionTriggerRef = useRef<HTMLButtonElement>(null);
  const professionCancelRef = useRef<HTMLButtonElement>(null);
  const professionSubmissionFlightRef = useRef(false);
  const professionDialogSucceeded = professionDialogOpen && currentProfessionSubmission?.status === "SUCCESS";
  const visibleProfessionDialogOpen = professionDialogOpen && !professionDialogSucceeded;
  const { formRef: professionFormRef, preserveDraft, clearDraft } = useDialogFormDraft(visibleProfessionDialogOpen);

  function handleProfessionSubmit(event: FormEvent<HTMLFormElement>): void {
    if (locked || professionSubmissionFlightRef.current) {
      event.preventDefault();
      return;
    }
    setProfessionSubmissionBaselineId(session.latest?.id ?? 0);
    professionSubmissionFlightRef.current = true;
    dispatchFormDataPreservingInput(event, updateProfession.action);
  }

  useEffect(() => {
    if (
      !professionSubmissionFlightRef.current ||
      !currentProfessionSubmission ||
      currentProfessionSubmission.status === "PENDING"
    ) {
      return;
    }

    professionSubmissionFlightRef.current = false;
    if (currentProfessionSubmission.status === "SUCCESS") clearDraft();
  }, [clearDraft, currentProfessionSubmission]);

  const closeProfessionDialog = (): void => {
    if (!pending) {
      if (!preserveDraft()) setProfessionSnapshot(null);
      setProfessionDialogOpen(false);
    }
  };

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
          <p className="font-semibold">แอดมินโรงพยาบาล</p>
          <p className="mt-1">การแก้ไขวิชาชีพหรือพักสิทธิ์แอดมินโรงพยาบาลต้องทำจากขั้นตอนเฉพาะ</p>
        </Alert>
      </div>
    );
  }

  if (accountStatus !== "ACTIVE") {
    return (
      <div className="space-y-6">
        {ownerControls}
        <Alert variant="warning">
          <p className="font-semibold">ยังเปลี่ยนสิทธิ์การทำงานไม่ได้</p>
          <p className="mt-1">
            บัญชีนี้ยังใช้งานไม่ได้ จึงยังเปลี่ยนวิชาชีพหรือสิทธิ์การทำงานในโรงพยาบาลนี้ไม่ได้
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
          <p className="font-semibold">ไม่มีรายการที่เปลี่ยนได้ในสถานะนี้</p>
          <p className="mt-1">กรุณาตรวจสอบสถานะการทำงานล่าสุด แล้วโหลดหน้านี้ใหม่</p>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ownerControls}
      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id="staff-membership-controls-heading" tabIndex={-1}>จัดการสิทธิ์เจ้าหน้าที่</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          การดำเนินการมีผลเฉพาะสิทธิ์การทำงานของเจ้าหน้าที่รายนี้ในโรงพยาบาลนี้ ไม่เปลี่ยนสถานะบัญชีหรือสิทธิ์ในโรงพยาบาลอื่น
        </p>

        <UnknownOutcomeAlert
          active={session.unconfirmed && latest?.kind !== "suspend" && !(professionDialogOpen && latest?.kind === "profession")}
          className="mt-4"
          recovery={{ kind: "reload" }}
        />
        {actions.updateProfession ? (
          <div className="mt-5 border-t border-border pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-text-muted">วิชาชีพ</p>
                <p className="mt-1 text-base text-text">{profession ? professionLabels[profession] : "ยังไม่ได้ระบุวิชาชีพ"}</p>
              </div>
              <Button
                disabled={locked}
                onClick={() => {
                  setProfessionSubmissionBaselineId(session.latest?.id ?? 0);
                  if (professionSnapshot === null || currentProfessionSubmission?.status === "SUCCESS") setProfessionSnapshot(expectedUpdatedAt);
                  setProfessionDialogOpen(true);
                }}
                ref={professionTriggerRef}
                size="compact"
                type="button"
                variant="secondary"
              >
                แก้ไขวิชาชีพ
              </Button>
            </div>
            {visibleProfessionDialogOpen ? (
              <ModalDialog
                description="เปลี่ยนเฉพาะวิชาชีพของเจ้าหน้าที่รายนี้ในโรงพยาบาลนี้"
                dismissible={!updateProfession.pending}
                footer={
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Button ref={professionCancelRef} className="w-full sm:w-auto" disabled={updateProfession.pending} onClick={closeProfessionDialog} variant="secondary">
                      ยกเลิก
                    </Button>
                    <Button className="w-full sm:w-auto" disabled={locked} form={professionFormId} loading={updateProfession.pending} size="compact" type="submit">
                      {updateProfession.pending ? "กำลังบันทึก..." : "บันทึกวิชาชีพ"}
                    </Button>
                  </div>
                }
                initialFocusRef={professionRef}
                onRequestClose={closeProfessionDialog}
                returnFocusTarget={() => professionTriggerRef.current ?? document.getElementById("staff-membership-controls-heading") ?? document.querySelector<HTMLElement>("main h1")}
                size="compact"
                title="แก้ไขวิชาชีพ"
              >
                <form action={updateProfession.action} id={professionFormId} onSubmit={handleProfessionSubmit} ref={professionFormRef}>
                  <input name="relationshipId" type="hidden" value={relationshipId} />
                  <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
                  <input name="expectedUpdatedAt" type="hidden" value={professionSnapshot ?? expectedUpdatedAt} />
                  <label className="block space-y-2 text-sm font-semibold" htmlFor="profession">
                    <span>วิชาชีพ</span>
                    <Select defaultValue={profession ?? ""} disabled={locked} id="profession" name="profession" ref={professionRef} required>
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
                </form>
                {currentProfessionSubmission && currentProfessionSubmission.status !== "PENDING" && currentProfessionSubmission.status !== "SUCCESS" && currentProfessionSubmission.status !== "UNCONFIRMED" && currentProfessionSubmission.message ? (
                  <Alert className="mt-3" role="alert" variant={currentProfessionSubmission.status === "CONFLICT" ? "warning" : "danger"}>
                    {currentProfessionSubmission.message}
                  </Alert>
                ) : null}
                <UnknownOutcomeAlert active={currentProfessionSubmission?.status === "UNCONFIRMED"} className="mt-3" recovery={{ kind: "reload" }} />
              </ModalDialog>
            ) : null}
          </div>
        ) : null}

        {actions.suspend ? (
          <ConfirmableActionForm
            action={suspend.action}
            className="mt-6 border-t border-border pt-5"
            confirmation={{
              title: "พักสิทธิ์เจ้าหน้าที่รายนี้ชั่วคราวหรือไม่",
              description: "เจ้าหน้าที่รายนี้จะใช้สิทธิ์ทำงานในโรงพยาบาลนี้ไม่ได้ชั่วคราว",
              details: <p>บัญชีผู้ใช้และสิทธิ์ในโรงพยาบาลอื่นจะคงเดิม การพักสิทธิ์นี้ไม่เปลี่ยนผู้รับผิดชอบผู้ป่วย</p>,
              confirmLabel: "พักสิทธิ์เจ้าหน้าที่ชั่วคราว",
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
              พักสิทธิ์การทำงานของเจ้าหน้าที่รายนี้เฉพาะในโรงพยาบาลนี้ บัญชีผู้ใช้และสิทธิ์ในโรงพยาบาลอื่นจะคงเดิม
            </p>
            <Button
              className="mt-3"
              disabled={locked}
              loading={suspend.pending}
              size="compact"
              type="submit"
              variant="danger"
            >
              {suspend.pending ? "กำลังพักสิทธิ์เจ้าหน้าที่ในโรงพยาบาลนี้..." : "พักสิทธิ์เจ้าหน้าที่ชั่วคราว"}
            </Button>
          </ConfirmableActionForm>
        ) : null}

        {actions.restore ? (
          <form action={restore.action} className="mt-5 border-t border-border pt-5">
            <input name="relationshipId" type="hidden" value={relationshipId} />
            <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
            <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
            <p className="text-sm leading-6 text-text-muted">
              เปิดสิทธิ์การทำงานของเจ้าหน้าที่รายนี้ในโรงพยาบาลนี้อีกครั้ง บัญชีต้องใช้งานได้อยู่แล้ว
            </p>
            <Button className="mt-3" disabled={locked} loading={restore.pending} size="compact" type="submit">
              {restore.pending ? "กำลังเปิดสิทธิ์เจ้าหน้าที่ในโรงพยาบาลนี้อีกครั้ง..." : "เปิดสิทธิ์การทำงานอีกครั้ง"}
            </Button>
          </form>
        ) : null}

        <ScopedMutationFeedback
          session={session}
          success={(submission) => submission.kind === "suspend"
            ? "พักสิทธิ์เจ้าหน้าที่ในโรงพยาบาลนี้ชั่วคราวแล้ว"
            : submission.kind === "restore"
              ? "เปิดสิทธิ์เจ้าหน้าที่ในโรงพยาบาลนี้อีกครั้งแล้ว"
              : "บันทึกวิชาชีพของเจ้าหน้าที่แล้ว"}
        />

        {relationshipStatus === "SUSPENDED" && !actions.restore ? (
          <p className="mt-4 text-sm leading-6 text-text-muted">ยังเปิดสิทธิ์การทำงานอีกครั้งจากหน้านี้ไม่ได้</p>
        ) : null}
      </Panel>
    </div>
  );
}
