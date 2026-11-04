"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { dispatchFormDataPreservingInput } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { useDialogFormDraft } from "@/components/ui/use-dialog-form-draft";
import type { UserKind } from "@/modules/user-management/domain/user-management-values";
import {
  DELETION_BLOCKER_LABELS,
  initialUserRecordDeletionActionState,
  type UserRecordDeletionActionState,
} from "@/modules/user-management/transport/action-state";
import { deleteUserRecordAction } from "@/modules/user-management/transport/server-actions";

import {
  standardNotice,
  useScopedMutation,
  useScopedMutationSession,
  type MutationVerdict,
} from "../../../workforce/scoped-mutation";

const deleteNotice = standardNotice({
  success: "ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งานแล้ว",
  conflict: "ลบข้อมูลผู้ใช้นี้ไม่ได้ กรุณาตรวจสอบเหตุผลที่แสดง",
  forbidden: "ไม่มีสิทธิ์ลบข้อมูลผู้ใช้นี้",
});

function classifyDelete(state: UserRecordDeletionActionState): MutationVerdict {
  switch (state.outcome) {
    case "DELETED":
      return state.success ? "SUCCESS" : "UNCONFIRMED";
    case "NOT_DELETABLE":
    case "CONFLICT":
    case "NOT_FOUND":
      return "CONFLICT";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "INVALID_CONFIRMATION":
      return "REJECTED";
    default:
      return "UNCONFIRMED";
  }
}

type DeletePayload = { kind: UserKind; relationshipId: string; hospitalId: string; updatedAt: string };

/** UM-D2a: shown only when the server found the record unused; the action re-checks everything. */
export function UserRecordDeleteControl({ kind, relationshipId, hospitalId, updatedAt, directoryHref, resourceName }: {
  kind: UserKind;
  relationshipId: string;
  hospitalId: string;
  updatedAt: string;
  directoryHref: string;
  resourceName: string;
}): React.JSX.Element {
  const session = useScopedMutationSession<UserRecordDeletionActionState>({ scope: relationshipId, lockOnSuccess: true });
  const { action, pending } = useScopedMutation(session, {
    kind: "delete-record",
    action: deleteUserRecordAction,
    initialState: initialUserRecordDeletionActionState,
    classify: classifyDelete,
    notice: deleteNotice,
    message: (state) => state.message,
  });
  const latest = session.latest?.scope === relationshipId ? session.latest : null;
  const deleted = latest?.status === "SUCCESS";
  const refusal = latest && latest.status !== "SUCCESS" && latest.status !== "PENDING" && latest.status !== "UNCONFIRMED" ? latest : null;
  const locked = pending || session.locked;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPayload, setDialogPayload] = useState<DeletePayload | null>(null);
  const formId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const directoryLinkRef = useRef<HTMLAnchorElement>(null);
  const [submissionBaselineId, setSubmissionBaselineId] = useState(0);
  const currentSubmission = latest && latest.id > submissionBaselineId ? latest : null;
  const confirmedDeletion = currentSubmission?.status === "SUCCESS";
  const visibleDialogOpen = dialogOpen && !confirmedDeletion;
  const { formRef, preserveDraft, clearDraft } = useDialogFormDraft(visibleDialogOpen);

  useEffect(() => {
    if (confirmedDeletion) clearDraft();
  }, [clearDraft, confirmedDeletion]);

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

  return (
    <div className="rounded-panel border border-border bg-surface p-5">
      {deleted ? (
        <div className="space-y-3" role="status">
          <p>{latest.state?.message}</p>
          <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={directoryHref} ref={directoryLinkRef}>
            กลับไปรายชื่อ
          </Link>
        </div>
      ) : (
        <Button disabled={locked} onClick={openDialog} ref={triggerRef} type="button" variant="danger">
          ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งาน
        </Button>
      )}
      {visibleDialogOpen ? (
        <ModalDialog
          description={
            <>
              ลบได้เฉพาะข้อมูลของ {resourceName} ที่บัญชียังไม่เคยเปิดใช้งานและไม่มีประวัติการดูแลหรือข้อมูลอื่นที่ผูกอยู่
              ระบบจะลบข้อมูลผู้ใช้และบัญชีที่ยังไม่เปิดใช้งาน พร้อมยกเลิกลิงก์เปิดใช้งานหรือการลงทะเบียนด้วยตนเองที่ยังค้างอยู่
              <strong> การลบย้อนกลับไม่ได้</strong> หลังลบแล้วจึงเพิ่มรายการใหม่ด้วยข้อมูลที่ถูกต้องได้
            </>
          }
          dismissible={!pending}
          footer={
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button ref={cancelButtonRef} className="w-full sm:w-auto" disabled={pending} onClick={closeDialog} variant="secondary">
                ยกเลิก
              </Button>
              <Button className="w-full sm:w-auto" disabled={locked} form={formId} loading={pending} size="compact" type="submit" variant="danger">
                {pending ? "กำลังลบข้อมูลผู้ใช้…" : "ยืนยันลบข้อมูลผู้ใช้ถาวร"}
              </Button>
            </div>
          }
          initialFocusRef={cancelButtonRef}
          onRequestClose={closeDialog}
          returnFocusTarget={() => deleted
            ? directoryLinkRef.current ?? Array.from(document.querySelectorAll<HTMLAnchorElement>("main a")).find((link) => link.getAttribute("href") === directoryHref) ?? document.querySelector<HTMLElement>("main h1")
            : triggerRef.current ?? document.getElementById("user-delete-heading") ?? document.querySelector<HTMLElement>("main h1")}
          size="default"
          title={`ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งานของ ${resourceName} หรือไม่`}
        >
          <form action={action} id={formId} onSubmit={handleSubmit} ref={formRef}>
            <input name="kind" type="hidden" value={dialogPayload?.kind ?? kind} />
            <input name="relationshipId" type="hidden" value={dialogPayload?.relationshipId ?? relationshipId} />
            <input name="targetHospitalId" type="hidden" value={dialogPayload?.hospitalId ?? hospitalId} />
            <input name="expectedUpdatedAt" type="hidden" value={dialogPayload?.updatedAt ?? updatedAt} />
            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor={`delete-confirmation-${relationshipId}`}>
              <span>พิมพ์ “ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งาน” เพื่อยืนยัน</span>
              <input
                autoComplete="off"
                className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                disabled={locked}
                id={`delete-confirmation-${relationshipId}`}
                name="confirmation"
                required
              />
            </label>
          </form>
          {refusal ? (
            <Alert className="mt-3" role="alert" variant={refusal.status === "CONFLICT" ? "warning" : "danger"}>
              <p>{refusal.message}</p>
              {refusal.state?.blockers.length ? (
                <ul className="mt-2 list-disc pl-5">
                  {refusal.state.blockers.map((blocker) => <li key={blocker}>{DELETION_BLOCKER_LABELS[blocker]}</li>)}
                </ul>
              ) : null}
            </Alert>
          ) : null}
          <UnknownOutcomeAlert active={session.unconfirmed} className="mt-3" recovery={{ kind: "reload" }} />
        </ModalDialog>
      ) : null}
      {!visibleDialogOpen && refusal ? (
        <Alert className="mt-3" role="alert" variant={refusal.status === "CONFLICT" ? "warning" : "danger"}>
          <p>{refusal.message}</p>
          {refusal.state?.blockers.length ? (
            <ul className="mt-2 list-disc pl-5">
              {refusal.state.blockers.map((blocker) => <li key={blocker}>{DELETION_BLOCKER_LABELS[blocker]}</li>)}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      <UnknownOutcomeAlert active={session.unconfirmed && !visibleDialogOpen} className="mt-3" recovery={{ kind: "reload" }} />
    </div>
  );
}
