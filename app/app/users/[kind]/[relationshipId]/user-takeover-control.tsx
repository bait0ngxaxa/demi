"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { dispatchFormDataPreservingInput } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { useDialogFormDraft } from "@/components/ui/use-dialog-form-draft";
import type { UserKind } from "@/modules/user-management/domain/user-management-values";
import {
  initialUserTakeoverActionState,
  type UserTakeoverActionState,
} from "@/modules/user-management/transport/action-state";
import { lockSuspectedTakeoverAction } from "@/modules/user-management/transport/server-actions";

import {
  standardNotice,
  useScopedMutation,
  useScopedMutationSession,
  type MutationVerdict,
} from "../../../workforce/scoped-mutation";

const takeoverNotice = standardNotice({
  conflict: "ล็อกบัญชีนี้ไม่ได้ กรุณาตรวจสอบข้อความที่แสดง",
  forbidden: "ไม่มีสิทธิ์ล็อกบัญชีนี้",
});

function classifyTakeover(state: UserTakeoverActionState): MutationVerdict {
  switch (state.outcome) {
    case "LOCKED":
      return state.success ? "SUCCESS" : "UNCONFIRMED";
    case "NOT_ELIGIBLE":
    case "REQUIRES_ADMIN":
    case "CONFLICT":
      return "CONFLICT";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "INVALID_CONFIRMATION":
      return "REJECTED";
    default:
      return "UNCONFIRMED";
  }
}

type TakeoverPayload = { kind: UserKind; relationshipId: string; hospitalId: string; updatedAt: string };

/** UM-D5. A repeated request retries only the provider ban for an existing lock. */
export function UserTakeoverControl({ kind, relationshipId, hospitalId, updatedAt, retry, resourceName, hospitalName }: {
  kind: UserKind;
  relationshipId: string;
  hospitalId: string;
  updatedAt: string;
  retry: boolean;
  resourceName: string;
  hospitalName: string;
}): React.JSX.Element {
  const session = useScopedMutationSession<UserTakeoverActionState>({ scope: relationshipId });
  const { action, pending } = useScopedMutation(session, {
    kind: "takeover-lock",
    action: lockSuspectedTakeoverAction,
    initialState: initialUserTakeoverActionState,
    classify: classifyTakeover,
    notice: takeoverNotice,
    message: (state) => state.message,
  });
  const latest = session.latest?.scope === relationshipId ? session.latest : null;
  const providerConfirmed = latest?.status === "SUCCESS" && latest.state?.providerState === "CONFIRMED";
  const providerRetryRequired = latest?.status === "SUCCESS" && !providerConfirmed;
  const retryMode = retry || providerRetryRequired;
  const failure = latest && (latest.status === "CONFLICT" || latest.status === "FORBIDDEN" || latest.status === "REJECTED")
    ? latest.message
    : null;
  const locked = pending || session.locked || providerConfirmed;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPayload, setDialogPayload] = useState<TakeoverPayload | null>(null);
  const formId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [submissionBaselineId, setSubmissionBaselineId] = useState(0);
  const currentSubmission = latest && latest.id > submissionBaselineId ? latest : null;
  const confirmedCurrentTakeover = currentSubmission?.status === "SUCCESS" && currentSubmission.state?.providerState === "CONFIRMED";
  const visibleDialogOpen = dialogOpen && !confirmedCurrentTakeover;
  const { formRef, preserveDraft, clearDraft } = useDialogFormDraft(visibleDialogOpen);

  useEffect(() => {
    if (confirmedCurrentTakeover) clearDraft();
  }, [clearDraft, confirmedCurrentTakeover]);

  function openDialog(): void {
    setSubmissionBaselineId(session.latest?.id ?? 0);
    if (dialogPayload === null) setDialogPayload({ kind, relationshipId, hospitalId, updatedAt });
    setDialogOpen(true);
  }

  function closeDialog(): void {
    if (!pending) {
      if (!preserveDraft()) setDialogPayload(null);
      setDialogOpen(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (locked) {
      event.preventDefault();
      return;
    }
    setSubmissionBaselineId(session.latest?.id ?? 0);
    dispatchFormDataPreservingInput(event, action);
  }
  const headingTarget = (): HTMLElement | null => document.getElementById("user-takeover-heading");

  return (
    <div className="rounded-panel border border-border bg-surface p-5">
      {providerConfirmed ? (
        <div ref={statusRef} role="status" tabIndex={-1}>
          <Alert role="presentation" variant="success">
            <p className="font-semibold">ระงับการใช้งานบัญชีแล้ว</p>
            <p className="mt-1">บริการภายนอกยืนยันการระงับการเข้าใช้บัญชีนี้แล้ว</p>
            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer items-center font-medium underline underline-offset-4">เกี่ยวกับอุปกรณ์ที่เข้าสู่ระบบอยู่</summary>
              <p className="mt-1">อุปกรณ์ที่เปิดบัญชีไว้ก่อนหน้านี้อาจยังแสดงว่ากำลังเข้าสู่ระบบ แต่ DEMI จะปฏิเสธการใช้งานบัญชีที่ถูกระงับ</p>
            </details>
          </Alert>
        </div>
      ) : (
        <Button disabled={locked} onClick={openDialog} ref={triggerRef} type="button" variant="danger">
          {retryMode ? "ตรวจสอบการระงับการเข้าใช้อีกครั้ง" : "แจ้งสงสัยว่ามีผู้อื่นใช้บัญชีนี้"}
        </Button>
      )}
      {visibleDialogOpen ? (
        <ModalDialog
          description={retryMode ? (
            <>
              <p>บัญชี {resourceName} ถูกระงับใน DEMI แล้ว ครั้งนี้จะตรวจสอบการระงับการเข้าใช้กับบริการภายนอกอีกครั้งเท่านั้น</p>
              <p className="mt-2">{kind === "patient"
                ? `จะไม่เปลี่ยนข้อมูลการดูแลผู้ป่วยของ “${hospitalName}”`
                : `จะไม่พักสิทธิ์การทำงานที่ “${hospitalName}” ซ้ำ`}</p>
              <p className="mt-2">อุปกรณ์ที่เปิดบัญชีไว้ก่อนหน้านี้อาจยังแสดงว่ากำลังเข้าสู่ระบบ แต่บัญชีนี้ใช้ DEMI ไม่ได้</p>
            </>
          ) : (
            <>
              <p>ใช้เมื่อสงสัยว่ามีผู้อื่นใช้บัญชี {resourceName} บัญชีนี้จะเข้าใช้ DEMI ไม่ได้ทันที</p>
              <p className="mt-2">{kind === "patient"
                ? `ข้อมูลการดูแลผู้ป่วยของ “${hospitalName}” จะยังคงอยู่`
                : `สิทธิ์ทำงานที่ “${hospitalName}” จะถูกพัก`}</p>
              <p className="mt-2">ระบบจะขอให้บริการภายนอกระงับการเข้าใช้ แต่อาจยังไม่ได้รับการยืนยัน อุปกรณ์ที่เปิดบัญชีไว้ก่อนหน้าอาจยังแสดงว่ากำลังเข้าสู่ระบบ แต่ DEMI จะปฏิเสธบัญชีนี้</p>
              <p className="mt-2">การเชื่อม LINE ที่เกิดหลังเปิดใช้งานจะถูกยกเลิกและเก็บประวัติไว้ การกู้คืนต้องยืนยันตัวตนและตั้งรหัสผ่านใหม่</p>
            </>
          )}
          dismissible={!pending}
          footer={
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button ref={cancelButtonRef} className="w-full sm:w-auto" disabled={pending} onClick={closeDialog} variant="secondary">
                ยกเลิก
              </Button>
              <Button className="w-full sm:w-auto" disabled={locked} form={formId} loading={pending} size="compact" type="submit" variant="danger">
                {pending ? retryMode ? "กำลังตรวจสอบ..." : "กำลังระงับบัญชี..." : retryMode ? "ตรวจสอบอีกครั้ง" : "ยืนยันระงับบัญชี"}
              </Button>
            </div>
          }
          initialFocusRef={cancelButtonRef}
          onRequestClose={closeDialog}
          returnFocusTarget={() => providerConfirmed ? statusRef.current : triggerRef.current ?? headingTarget()}
          size="default"
          title={retryMode ? `ตรวจสอบการระงับการเข้าสู่ระบบของ ${resourceName} อีกครั้ง` : `ระงับบัญชี ${resourceName}`}
        >
          <form action={action} id={formId} onSubmit={handleSubmit} ref={formRef}>
            <input name="kind" type="hidden" value={dialogPayload?.kind ?? kind} />
            <input name="relationshipId" type="hidden" value={dialogPayload?.relationshipId ?? relationshipId} />
            <input name="targetHospitalId" type="hidden" value={dialogPayload?.hospitalId ?? hospitalId} />
            <input name="expectedUpdatedAt" type="hidden" value={dialogPayload?.updatedAt ?? updatedAt} />
            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor={`takeover-confirmation-${relationshipId}`}>
              <span>พิมพ์ “สงสัยว่ามีผู้อื่นใช้บัญชีนี้” เพื่อยืนยัน</span>
              <input
                autoComplete="off"
                className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                disabled={locked}
                id={`takeover-confirmation-${relationshipId}`}
                name="confirmation"
                required
              />
            </label>
          </form>
          {failure ? <Alert className="mt-3" role="alert" variant={latest?.status === "CONFLICT" ? "warning" : "danger"}>{failure}</Alert> : null}
          {providerRetryRequired && latest?.state?.message ? <Alert className="mt-3" role="status" variant="warning">{latest.state.message}</Alert> : null}
          <UnknownOutcomeAlert active={session.unconfirmed} className="mt-3" recovery={{ kind: "reload" }} />
        </ModalDialog>
      ) : null}
      {!visibleDialogOpen && failure ? <Alert className="mt-3" role="alert" variant={latest?.status === "CONFLICT" ? "warning" : "danger"}>{failure}</Alert> : null}
      {!visibleDialogOpen && providerRetryRequired && latest?.state?.message ? <Alert className="mt-3" role="status" variant="warning">{latest.state.message}</Alert> : null}
      <UnknownOutcomeAlert active={session.unconfirmed && !visibleDialogOpen} className="mt-3" recovery={{ kind: "reload" }} />
    </div>
  );
}
