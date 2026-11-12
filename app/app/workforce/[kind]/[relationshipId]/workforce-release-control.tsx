"use client";

import Link from "next/link";
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
  success: "สิทธิ์การทำงานกับโรงพยาบาลนี้สิ้นสุดแล้ว",
  conflict: "ไม่สามารถดำเนินการได้ ข้อมูลอาจเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่",
  forbidden: "ไม่มีสิทธิ์สิ้นสุดสิทธิ์การทำงานกับโรงพยาบาลนี้",
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

/**
 * The Hospital's upcoming appointments left without the released assignee: after an อสม. release, the
 * "ไม่มี อสม. รับผิดชอบ" filter; after a staff release, the "ไม่มีผู้รับผิดชอบ" filter (neither assignee set).
 */
function releasedAppointmentsHref(hospitalId: string, kind: "osm" | "staff"): string {
  const params = new URLSearchParams({ hospitalId, tab: "UPCOMING" });
  params.set(kind === "osm" ? "unassignedOsm" : "unassigned", "true");
  return `/app/appointments?${params.toString()}`;
}

type ReleasePayload ={ relationshipId: string; hospitalId: string; kind: "osm" | "staff"; updatedAt: string };

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
  const subjectLabel = kind === "osm" ? "อสม." : "เจ้าหน้าที่";
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
        <div className="space-y-3">
          <p className="text-sm leading-6 text-text" ref={statusRef} role="status" tabIndex={-1}>
            {latest.state?.message ?? "สิทธิ์การทำงานกับโรงพยาบาลนี้สิ้นสุดแล้ว ประวัติยังคงอยู่"}
          </p>
          {(latest.state?.unassignedAppointmentCount ?? 0) > 0 ? (
            <Link
              className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              href={releasedAppointmentsHref(hospitalId, kind)}
              prefetch={false}
            >
              ดูนัดหมายที่จะถึงของโรงพยาบาลนี้
            </Link>
          ) : null}
        </div>
      ) : (
        <Button disabled={locked} onClick={openDialog} ref={triggerRef} type="button" variant="danger">
          นำ{subjectLabel}ออกจากโรงพยาบาลนี้อย่างถาวร
        </Button>
      )}
      {visibleDialogOpen ? (
        <ModalDialog
          description={
            <>
              สิทธิ์การทำงานของ {subjectLabel} {resourceName} ใน {hospitalName} จะสิ้นสุดถาวรและเปิดสิทธิ์เดิมกลับไม่ได้ หากต้องการให้ทำงานอีกครั้ง ต้องเพิ่มผ่านขั้นตอนเดิม ประวัติการทำงานยังคงอยู่
              {kind === "osm" ? " การมอบหมายผู้ป่วยที่ค้างอยู่จะสิ้นสุดด้วย" : ""}
              {` นัดหมายที่จะถึงในโรงพยาบาลนี้ซึ่ง${subjectLabel}คนนี้รับผิดชอบจะไม่มีผู้รับผิดชอบ และต้องมอบหมายผู้รับผิดชอบใหม่ นัดหมายยังคงอยู่และไม่มีการแจ้งเตือนผู้ป่วย`}
              {" "}บัญชีผู้ใช้และสิทธิ์ที่มีอยู่ในโรงพยาบาลอื่นจะคงเดิม แต่ลิงก์เปิดใช้งานที่ยังไม่ได้ใช้ของบัญชีนี้ในทุกโรงพยาบาลจะถูกเพิกถอน
            </>
          }
          dismissible={!pending}
          footer={
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button ref={cancelButtonRef} className="w-full sm:w-auto" disabled={pending} onClick={closeDialog} variant="secondary">
                ยกเลิก
              </Button>
              <Button className="w-full sm:w-auto" disabled={locked} form={formId} loading={pending} size="compact" type="submit" variant="danger">
                {pending ? "กำลังนำออกจากโรงพยาบาลนี้…" : "ยืนยันนำออกจากโรงพยาบาลนี้อย่างถาวร"}
              </Button>
            </div>
          }
          initialFocusRef={cancelButtonRef}
          onRequestClose={closeDialog}
          returnFocusTarget={() => released ? statusRef.current : triggerRef.current ?? document.querySelector<HTMLElement>("main h1")}
          size="default"
          title={`นำ${subjectLabel} ${resourceName} ออกจาก ${hospitalName} อย่างถาวร`}
        >
          <form action={action} id={formId} onSubmit={handleSubmit} ref={formRef}>
            <input name="relationshipId" type="hidden" value={dialogPayload?.relationshipId ?? relationshipId} />
            <input name="targetHospitalId" type="hidden" value={dialogPayload?.hospitalId ?? hospitalId} />
            <input name="kind" type="hidden" value={dialogPayload?.kind ?? kind} />
            <input name="expectedUpdatedAt" type="hidden" value={dialogPayload?.updatedAt ?? updatedAt} />
            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="release-confirmation">
              <span>พิมพ์ “นำออกจากโรงพยาบาลนี้อย่างถาวร” เพื่อยืนยัน</span>
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
