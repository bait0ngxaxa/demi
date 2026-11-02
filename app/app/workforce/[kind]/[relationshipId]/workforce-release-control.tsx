"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { dispatchFormDataPreservingInput } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { useDialogFormDraft } from "@/components/ui/use-dialog-form-draft";
import {
  initialWorkforceReleaseActionState,
  type WorkforceReleaseActionState,
} from "@/modules/workforce/transport/action-state";
import { releaseWorkforceAction } from "@/modules/workforce/transport/workforce-release-action";

import {
  standardNotice,
  useScopedMutation,
  useScopedMutationSession,
  type MutationVerdict,
} from "../../scoped-mutation";

const releaseNotice = standardNotice({
  success: "นำความสัมพันธ์ออกจากระบบแล้ว",
  conflict: "ไม่สามารถนำออกจากระบบได้ กรุณาโหลดข้อมูลล่าสุด",
  forbidden: "ไม่มีสิทธิ์นำความสัมพันธ์ออกจากระบบ",
});

/** Only the server's typed outcome counts; a bare `{ success: false }` is never read as a conflict or refusal. */
function classifyRelease(state: WorkforceReleaseActionState): MutationVerdict {
  switch (state.outcome) {
    case "RELEASED":
      return state.success ? "SUCCESS" : "UNCONFIRMED";
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

type ReleasePayload = { relationshipId: string; hospitalId: string; kind: "osm" | "staff"; updatedAt: string };

export function WorkforceReleaseControl({ relationshipId, hospitalId, kind, updatedAt, resourceName, hospitalName }: {
  relationshipId: string;
  hospitalId: string;
  kind: "osm" | "staff";
  updatedAt: string;
  resourceName: string;
  hospitalName: string;
}): React.JSX.Element {
  // The Server Action revalidates the roster itself, and a release is terminal, so it is never refreshed or repeated.
  const session = useScopedMutationSession<WorkforceReleaseActionState>({ scope: relationshipId, lockOnSuccess: true });
  const { action, pending } = useScopedMutation(session, {
    kind: "release",
    action: releaseWorkforceAction,
    initialState: initialWorkforceReleaseActionState,
    classify: classifyRelease,
    notice: releaseNotice,
    message: (state) => state.message,
  });
  const latest = session.latest?.scope === relationshipId ? session.latest : null;
  const released = latest?.status === "SUCCESS";
  const failure = latest && (latest.status === "CONFLICT" || latest.status === "FORBIDDEN" || latest.status === "REJECTED")
    ? latest.message
    : null;
  const locked = pending || session.locked;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPayload, setDialogPayload] = useState<ReleasePayload | null>(null);
  const formId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [submissionBaselineId, setSubmissionBaselineId] = useState(0);
  const currentSubmission = latest && latest.id > submissionBaselineId ? latest : null;
  const confirmedCurrentRelease = currentSubmission?.status === "SUCCESS";
  const visibleDialogOpen = dialogOpen && !confirmedCurrentRelease;
  const { formRef, preserveDraft, clearDraft } = useDialogFormDraft(visibleDialogOpen);

  useEffect(() => {
    if (confirmedCurrentRelease) clearDraft();
  }, [clearDraft, confirmedCurrentRelease]);

  function openDialog(): void {
    setSubmissionBaselineId(session.latest?.id ?? 0);
    if (dialogPayload === null) setDialogPayload({ relationshipId, hospitalId, kind, updatedAt });
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
      {released ? (
        <p className="text-sm leading-6 text-text" ref={statusRef} role="status" tabIndex={-1}>
          {latest.state?.message ?? "นำความสัมพันธ์ออกจากระบบแล้ว"}
        </p>
      ) : (
        <Button disabled={locked} onClick={openDialog} ref={triggerRef} type="button" variant="danger">
          นำออกจากระบบ
        </Button>
      )}
      {visibleDialogOpen ? (
        <ModalDialog
          description={
            <>
              การนำ {resourceName} ออกจาก {hospitalName} จะสิ้นสุดสิทธิ์ในโรงพยาบาลนี้ทันที
              {kind === "osm" ? " การมอบหมายผู้ป่วยที่ค้างอยู่จะสิ้นสุดด้วย" : ""}
              {" "}ลิงก์เปิดใช้งานและตั้งรหัสผ่านใหม่ที่ค้างอยู่จะถูกเพิกถอน ประวัติจะยังเก็บไว้ และการนำออกนี้ย้อนกลับไม่ได้ หากต้องการให้ทำงานอีกครั้งต้องเพิ่มใหม่ตามขั้นตอนปกติ
            </>
          }
          dismissible={!pending}
          footer={
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button ref={cancelButtonRef} className="w-full sm:w-auto" disabled={pending} onClick={closeDialog} variant="secondary">
                ยกเลิก
              </Button>
              <Button className="w-full sm:w-auto" disabled={locked} form={formId} loading={pending} size="compact" type="submit" variant="danger">
                {pending ? "กำลังนำออก…" : "ยืนยันนำออกจากระบบถาวร"}
              </Button>
            </div>
          }
          initialFocusRef={cancelButtonRef}
          onRequestClose={closeDialog}
          returnFocusTarget={() => released ? statusRef.current : triggerRef.current ?? document.querySelector<HTMLElement>("main h1")}
          size="default"
          title={`นำความสัมพันธ์ของ ${resourceName} ออกจากระบบ`}
        >
          <form action={action} id={formId} onSubmit={handleSubmit} ref={formRef}>
            <input name="relationshipId" type="hidden" value={dialogPayload?.relationshipId ?? relationshipId} />
            <input name="targetHospitalId" type="hidden" value={dialogPayload?.hospitalId ?? hospitalId} />
            <input name="kind" type="hidden" value={dialogPayload?.kind ?? kind} />
            <input name="expectedUpdatedAt" type="hidden" value={dialogPayload?.updatedAt ?? updatedAt} />
            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="release-confirmation">
              <span>พิมพ์ “นำออกจากระบบ” เพื่อยืนยัน</span>
              <input
                autoComplete="off"
                className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                disabled={locked}
                id="release-confirmation"
                name="confirmation"
                required
              />
            </label>
          </form>
          {failure ? <Alert className="mt-3" role="alert" variant={latest?.status === "CONFLICT" ? "warning" : "danger"}>{failure}</Alert> : null}
          <UnknownOutcomeAlert active={session.unconfirmed} className="mt-3" recovery={{ kind: "reload" }} />
        </ModalDialog>
      ) : null}
      {!visibleDialogOpen && failure ? <Alert className="mt-3" role="alert" variant={latest?.status === "CONFLICT" ? "warning" : "danger"}>{failure}</Alert> : null}
      <UnknownOutcomeAlert active={session.unconfirmed && !visibleDialogOpen} className="mt-3" recovery={{ kind: "reload" }} />
    </div>
  );
}
