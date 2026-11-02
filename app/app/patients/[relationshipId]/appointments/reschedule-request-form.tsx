"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { dispatchFormDataPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { useDialogFormDraft } from "@/components/ui/use-dialog-form-draft";
import { rejectRescheduleRequestAction, submitRescheduleRequestAction, type RescheduleRequestActionState } from "@/modules/appointments/transport/reschedule-request-actions";

type RescheduleRequestContext = {
  requester: string;
  submittedAt: string;
  reason: string;
  preferredDatetimes: string[];
};

export function RescheduleRequestForm({ relationshipId, appointmentId, appointmentSummary, expectedUpdatedAt, nonce, requestId, requestContext, returnFocusHeadingId }: {
  relationshipId: string;
  appointmentId: string;
  appointmentSummary: string;
  expectedUpdatedAt?: string;
  nonce?: string;
  requestId?: string;
  requestContext?: RescheduleRequestContext;
  returnFocusHeadingId: string;
}): React.JSX.Element {
  const rejecting = requestId !== undefined;
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<RescheduleRequestActionState, FormData>(
    rejecting ? rejectRescheduleRequestAction : submitRescheduleRequestAction,
    { status: "IDLE", message: "" },
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const formId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const firstDatetimeRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const submissionRef = useRef(false);
  const visibleDialogOpen = dialogOpen && state.status !== "SUCCESS";
  const { formRef, preserveDraft, clearDraft } = useDialogFormDraft(visibleDialogOpen);

  useEffect(() => {
    if (!pending) submissionRef.current = false;
    if (state.status === "SUCCESS") clearDraft();
  }, [clearDraft, pending, state.status]);

  function closeDialog(): void {
    if (pending || unknownOutcome) return;
    preserveDraft();
    setDialogOpen(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    if (pending || unknownOutcome || submissionRef.current) {
      event.preventDefault();
      return;
    }
    submissionRef.current = true;
    dispatchFormDataPreservingInput(event, action);
  }

  function resendOriginalRequest(): void {
    if (pending || submissionRef.current) return;
    submissionRef.current = true;
    resendUnconfirmed();
  }

  function restoreFocus(): void {
    const target = resultRef.current?.isConnected
      ? resultRef.current
      : triggerRef.current?.isConnected
        ? triggerRef.current
        : document.getElementById(returnFocusHeadingId) ?? document.querySelector<HTMLElement>("main h1");
    target?.focus();
  }

  const control = "mt-2 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";
  const title = rejecting ? "ปฏิเสธคำขอเลื่อนนัด" : "ขอเลื่อนนัด";
  const description = rejecting
    ? <>นัดหมายปัจจุบัน: {appointmentSummary}. การยืนยันจะบันทึกว่าปฏิเสธคำขอนี้และไม่เปลี่ยนวันนัดหมาย คำขอเดิมจะไม่กลับเป็นสถานะรอพิจารณา หากต้องการเลื่อนอีกครั้งต้องส่งคำขอใหม่เมื่อเข้าเงื่อนไข หากปิดก่อนส่ง เหตุผลจะยังอยู่เมื่อเปิดกลับมา</>
    : <>นัดหมายปัจจุบัน: {appointmentSummary}. เลือกวันเวลา 1–3 ตัวเลือกและระบุเหตุผล เจ้าหน้าที่จะพิจารณาก่อนแก้ไขนัดหมาย หากปิดก่อนส่ง ข้อมูลที่กรอกจะยังอยู่เมื่อเปิดกลับมา</>;

  return <div className="space-y-3">
    {state.status === "SUCCESS" ? <p className="text-sm text-text" ref={resultRef} role="status" tabIndex={-1}>{state.message}</p> : (
      <Button onClick={() => setDialogOpen(true)} ref={triggerRef} type="button" variant={rejecting ? "danger" : "primary"}>
        {rejecting ? "ปฏิเสธคำขอพร้อมเหตุผล" : "ขอเลื่อนนัด"}
      </Button>
    )}
    {!visibleDialogOpen && state.status === "ERROR" ? <p className="text-sm text-danger" role="alert">{state.message}</p> : null}

    {visibleDialogOpen ? <ModalDialog
      description={description}
      dismissible={!pending && !unknownOutcome}
      footer={<div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" disabled={pending || unknownOutcome} onClick={closeDialog} ref={cancelRef} variant="secondary">ยกเลิก</Button>
        <Button
          className="w-full sm:w-auto"
          disabled={unknownOutcome}
          form={formId}
          loading={pending}
          size="compact"
          type="submit"
          variant={rejecting ? "danger" : "primary"}
        >
          {pending ? "กำลังส่ง…" : unknownOutcome ? "รอการตรวจสอบผล" : rejecting ? "ยืนยันปฏิเสธคำขอ" : "ส่งคำขอเลื่อนนัด"}
        </Button>
      </div>}
      initialFocusRef={rejecting ? cancelRef : firstDatetimeRef}
      onClosed={restoreFocus}
      onRequestClose={closeDialog}
      size="fullscreen"
      title={title}
    >
      <form action={action} className="space-y-5" id={formId} onSubmit={handleSubmit} ref={formRef}>
        <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />
        <input name="appointmentId" type="hidden" value={appointmentId} />
        {rejecting ? <>
          <input name="requestId" type="hidden" value={requestId} />
          {requestContext ? <section aria-label="รายละเอียดคำขอเลื่อนนัด" className="space-y-2 rounded-panel border border-border bg-surface-muted p-4">
            <h3 className="font-semibold text-text">รายละเอียดคำขอเดิม</h3>
            <p className="text-sm text-text-muted">ผู้ยื่น: {requestContext.requester} · ส่งเมื่อ {requestContext.submittedAt}</p>
            <p className="break-words text-text">เหตุผล: {requestContext.reason}</p>
            <div>
              <p className="text-sm font-semibold text-text">วันเวลาที่เสนอ</p>
              <ul className="list-inside list-disc break-words text-text-muted">
                {requestContext.preferredDatetimes.map((datetime) => <li key={datetime}>{datetime}</li>)}
              </ul>
            </div>
          </section> : null}
        </> : <>
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <input name="submissionNonce" type="hidden" value={nonce} />
          <p className="text-sm text-text-muted">วันเวลาที่สะดวก 1–3 ตัวเลือก (เวลาประเทศไทย) ภายใน 366 วัน เจ้าหน้าที่จะพิจารณาและแก้นัดหมาย</p>
          <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((index) => <div key={index}>
            <label htmlFor={`${formId}-datetime-${index}`} className="text-sm font-semibold text-text">ตัวเลือก {index}{index === 1 ? " (จำเป็น)" : ""}</label>
            <input
              className={control}
              disabled={pending || unknownOutcome}
              id={`${formId}-datetime-${index}`}
              name="preferredDatetimes"
              ref={index === 1 ? firstDatetimeRef : undefined}
              required={index === 1}
              type="datetime-local"
            />
          </div>)}</div>
        </>}
        <div>
          <label className="text-sm font-semibold text-text" htmlFor={`${formId}-reason`}>
            {rejecting ? "เหตุผลที่ปฏิเสธ" : "เหตุผลที่ขอเลื่อนนัด"}
          </label>
          <textarea
            className={control}
            disabled={pending || unknownOutcome}
            id={`${formId}-reason`}
            maxLength={500}
            name={rejecting ? "rejectionReason" : "reason"}
            required
          />
        </div>
        {state.message ? <p className="text-sm text-text" role={state.status === "ERROR" ? "alert" : "status"}>{state.message}</p> : null}
        <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendOriginalRequest, resending: pending }} />
      </form>
    </ModalDialog> : null}
  </div>;
}
