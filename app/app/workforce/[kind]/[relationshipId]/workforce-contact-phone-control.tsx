"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { dispatchFormDataPreservingInput } from "@/components/ui/mutation-action-state";
import { Panel } from "@/components/ui/panel";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { useDialogFormDraft } from "@/components/ui/use-dialog-form-draft";
import { workforceContactPhoneSchema } from "@/modules/workforce/schemas/workforce-schemas";
import { updateWorkforceContactPhoneAction, type WorkforceContactPhoneActionState } from "@/modules/workforce/transport/server-actions";
import { classifyWorkforceState, formString, standardNotice, useScopedMutation, useScopedMutationSession, workforceStateMessage } from "../../scoped-mutation";

const initialState: WorkforceContactPhoneActionState = { status: "IDLE" };
const notice = standardNotice({ success: "บันทึกเบอร์ติดต่อแล้ว", conflict: "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด", forbidden: "ไม่มีสิทธิ์แก้ไขเบอร์ติดต่อ" });

export function WorkforceContactPhoneControl(props: {
  kind: "staff" | "osm";
  relationshipId: string;
  targetHospitalId: string;
  expectedUpdatedAt: string;
  contactPhone: string | null;
  ended: boolean;
}): React.JSX.Element {
  const session = useScopedMutationSession<WorkforceContactPhoneActionState>({ scope: props.relationshipId, snapshot: props.expectedUpdatedAt, refreshOnSuccess: true });
  const mutation = useScopedMutation(session, {
    kind: "contact-phone", action: updateWorkforceContactPhoneAction, initialState,
    classify: (state, formData) => classifyWorkforceState(state, state.status === "SUCCESS" && state.result.relationshipId === formString(formData, "relationshipId") && state.result.hospitalId === formString(formData, "targetHospitalId")),
    notice, message: workforceStateMessage,
    resultSnapshot: (state) => state.status === "SUCCESS" ? state.result.updatedAt : null,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSnapshot, setDialogSnapshot] = useState<string | null>(null);
  const formId = useId();
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const submissionFlightRef = useRef(false);
  const [submissionBaselineId, setSubmissionBaselineId] = useState(0);
  const latestContactMutation = session.latest?.kind === "contact-phone" && session.latest.scope === props.relationshipId ? session.latest : null;
  const currentSubmission = latestContactMutation && latestContactMutation.id > submissionBaselineId ? latestContactMutation : null;
  const confirmedCurrentSubmission = currentSubmission?.status === "SUCCESS";
  const visibleDialogOpen = dialogOpen && !confirmedCurrentSubmission;
  const { formRef, preserveDraft, clearDraft } = useDialogFormDraft(visibleDialogOpen);
  const latestFailure = latestContactMutation &&
    (latestContactMutation.status === "CONFLICT" || latestContactMutation.status === "FORBIDDEN" || latestContactMutation.status === "REJECTED")
    ? latestContactMutation.message
    : null;

  useEffect(() => {
    if (!submissionFlightRef.current || !currentSubmission || currentSubmission.status === "PENDING") return;
    submissionFlightRef.current = false;
    if (confirmedCurrentSubmission) clearDraft();
  }, [clearDraft, confirmedCurrentSubmission, currentSubmission]);

  function closeDialog(): void {
    if (!mutation.pending) {
      if (!preserveDraft()) setDialogSnapshot(null);
      setDialogOpen(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (mutation.pending || session.locked || submissionFlightRef.current) {
      event.preventDefault();
      return;
    }

    const input = event.currentTarget.elements.namedItem("contactPhone");
    if (input instanceof HTMLInputElement) {
      const parsed = workforceContactPhoneSchema.safeParse(input.value);
      input.setCustomValidity(parsed.success ? "" : parsed.error.issues[0].message);
      if (!input.reportValidity()) {
        event.preventDefault();
        return;
      }
    }

    setSubmissionBaselineId(session.latest?.id ?? 0);
    submissionFlightRef.current = true;
    dispatchFormDataPreservingInput(event, mutation.action);
  }

  return (
    <Panel>
      <h2 className="text-lg font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id="workforce-contact-phone-heading" tabIndex={-1}>เบอร์ติดต่อ</h2>
      <div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="break-words text-sm text-muted">{props.contactPhone ?? "ยังไม่ได้ระบุเบอร์ติดต่อ"}</p>
        {!props.ended ? (
          <Button
            disabled={mutation.pending || session.locked}
            onClick={() => {
              setSubmissionBaselineId(session.latest?.id ?? 0);
              if (dialogSnapshot === null || confirmedCurrentSubmission) setDialogSnapshot(props.expectedUpdatedAt);
              setDialogOpen(true);
            }}
            ref={triggerRef}
            size="compact"
            type="button"
            variant="secondary"
          >
            แก้ไขเบอร์ติดต่อ
          </Button>
        ) : null}
      </div>
      {visibleDialogOpen ? (
        <ModalDialog
          description={props.kind === "osm" ? "เบอร์นี้จะแสดงให้ผู้ป่วยที่ อสม. ดูแลเห็น" : "เปลี่ยนเฉพาะเบอร์ติดต่อของเจ้าหน้าที่รายนี้ในโรงพยาบาลนี้"}
          dismissible={!mutation.pending}
          footer={
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button ref={cancelButtonRef} className="w-full sm:w-auto" disabled={mutation.pending} onClick={closeDialog} variant="secondary">
                ยกเลิก
              </Button>
              <Button className="w-full sm:w-auto" disabled={mutation.pending || session.locked} form={formId} loading={mutation.pending} size="compact" type="submit">
                {mutation.pending ? "กำลังบันทึก..." : "บันทึกเบอร์ติดต่อ"}
              </Button>
            </div>
          }
          initialFocusRef={phoneInputRef}
          onRequestClose={closeDialog}
          returnFocusTarget={() => triggerRef.current ?? document.getElementById("workforce-contact-phone-heading") ?? document.querySelector<HTMLElement>("main h1")}
          size="compact"
          title="แก้ไขเบอร์ติดต่อ"
        >
          <form action={mutation.action} id={formId} onSubmit={handleSubmit} ref={formRef}>
            <input name="kind" type="hidden" value={props.kind} />
            <input name="relationshipId" type="hidden" value={props.relationshipId} />
            <input name="targetHospitalId" type="hidden" value={props.targetHospitalId} />
            <input name="expectedUpdatedAt" type="hidden" value={dialogSnapshot ?? props.expectedUpdatedAt} />
            <label className="block space-y-2 text-sm font-semibold" htmlFor="contact-phone">
              <span>เบอร์ติดต่อใหม่</span>
              <Input
                ref={phoneInputRef}
                autoComplete="tel"
                defaultValue={props.contactPhone ?? ""}
                id="contact-phone"
                inputMode="tel"
                maxLength={32}
                name="contactPhone"
                disabled={mutation.pending || session.locked}
                onChange={(event) => event.target.setCustomValidity("")}
                required
              />
            </label>
          </form>
          {latestFailure ? (
            <Alert className="mt-3" role="alert" variant={latestContactMutation?.status === "CONFLICT" ? "warning" : "danger"}>{latestFailure}</Alert>
          ) : null}
          <UnknownOutcomeAlert active={currentSubmission?.status === "UNCONFIRMED"} className="mt-3" recovery={{ kind: "reload", label: "โหลดข้อมูลล่าสุด", message: "กรุณาตรวจสอบเบอร์ติดต่อล่าสุดก่อนบันทึกอีกครั้ง" }} />
        </ModalDialog>
      ) : null}
      {!dialogOpen && latestFailure ? <Alert className="mt-3" role="alert" variant={latestContactMutation?.status === "CONFLICT" ? "warning" : "danger"}>{latestFailure}</Alert> : null}
      <UnknownOutcomeAlert active={session.unconfirmed && !dialogOpen} className="mt-3" recovery={{ kind: "reload", label: "โหลดข้อมูลล่าสุด", message: "กรุณาตรวจสอบเบอร์ติดต่อล่าสุดก่อนบันทึกอีกครั้ง" }} />
    </Panel>
  );
}
