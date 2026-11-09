"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { Input, inputClassName } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { SavedRecordEmpty } from "../saved-record-card";
import { PatientSelfSessionExpiredAlert } from "../patient-self-session-expired-alert";
import {
  PATIENT_SELF_MEASUREMENT_BLOOD_SUGAR_UNIT,
  PATIENT_SELF_MEASUREMENT_OWN_PAGE_SIZE,
} from "@/modules/patient-self-measurements/domain/patient-self-measurement";
import type { OwnPatientSelfMeasurement } from "@/modules/patient-self-measurements/services/patient-self-measurement-service";
import {
  createOwnPatientSelfMeasurementAction,
  deleteOwnPatientSelfMeasurementAction,
  type PatientSelfMeasurementActionState,
} from "@/modules/patient-self-measurements/transport/server-actions";

import { PatientSelfMeasurementRecordCard } from "./patient-self-measurement-values";

const idle: PatientSelfMeasurementActionState = { status: "IDLE" };

const NUMBER_FIELDS = [
  { name: "weight", label: "น้ำหนัก (กก.)", step: "0.1" },
  { name: "bloodSugar", label: `ระดับน้ำตาลในเลือด (${PATIENT_SELF_MEASUREMENT_BLOOD_SUGAR_UNIT})`, step: "1" },
  { name: "systolicBloodPressure", label: "ความดันตัวบน (mmHg)", step: "1" },
  { name: "diastolicBloodPressure", label: "ความดันตัวล่าง (mmHg)", step: "1" },
] as const;

function submissionPayloadSignature(formData: FormData): string {
  return JSON.stringify(
    Array.from(formData.entries())
      .filter(([name]) => name !== "submissionNonce")
      .map(([name, value]) => [name, typeof value === "string" ? value : value.name]),
  );
}

function CreateForm({ nonce, defaultMeasuredAt, onSubmissionStart, onAttentionChange }: {
  nonce: string;
  defaultMeasuredAt: string;
  onSubmissionStart: () => void;
  onAttentionChange: (requiresAttention: boolean) => void;
}): React.JSX.Element {
  const prefix = useId();
  const nextSubmissionId = useRef(0);
  const activeSubmissionId = useRef<number | null>(null);
  const [currentSubmissionId, setCurrentSubmissionId] = useState<number | null>(null);
  const [settledResult, setSettledResult] = useState<{ submissionId: number; result: PatientSelfMeasurementActionState } | null>(null);
  const [confirmedPayload, setConfirmedPayload] = useState<string | null>(null);
  const [consumedNonce, setConsumedNonce] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [draftSignature, setDraftSignature] = useState<string | null>(null);
  const trackedAction = useCallback(async (
    previous: PatientSelfMeasurementActionState,
    formData: FormData,
  ): Promise<PatientSelfMeasurementActionState> => {
    try {
      const result = await createOwnPatientSelfMeasurementAction(previous, formData);
      const submissionId = activeSubmissionId.current;
      if (submissionId !== null && result.status !== "IDLE") setSettledResult({ submissionId, result });
      if (result.status === "SUCCESS") {
        setConfirmedPayload(submissionPayloadSignature(formData));
        const submittedNonce = formData.get("submissionNonce");
        if (typeof submittedNonce === "string") setConsumedNonce(submittedNonce);
      }
      return result;
    } finally {
      requestInFlight.current = false;
    }
  }, []);
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState(trackedAction, idle);
  const currentOutcome = currentSubmissionId === null || (
    settledResult?.submissionId === currentSubmissionId && settledResult.result === state
  );
  const currentError = state.status === "ERROR" && currentOutcome ? state : null;
  const currentSuccess = state.status === "SUCCESS" && currentOutcome && (
    currentSubmissionId === null || draftSignature === confirmedPayload
  ) ? state : null;
  const nonceConsumed = consumedNonce === nonce;
  const sameConfirmedDraft = Boolean(
    currentSuccess && currentSubmissionId !== null && draftSignature === confirmedPayload,
  );
  const canStartNewRecord = sameConfirmedDraft && !nonceConsumed;
  const startNewRecord = (): void => {
    if (!canStartNewRecord || pending || unknownOutcome || requestInFlight.current) return;
    const form = formRef.current;
    if (!form) return;
    const currentSignature = submissionPayloadSignature(new FormData(form));
    if (currentSignature !== confirmedPayload) {
      setDraftSignature(currentSignature);
      return;
    }
    form.reset();
    setDraftSignature(submissionPayloadSignature(new FormData(form)));
    setConfirmedPayload(null);
    setSettledResult(null);
  };
  useLayoutEffect(() => {
    onAttentionChange(pending || unknownOutcome || currentError?.recovery === "CRITICAL");
  }, [currentError, onAttentionChange, pending, unknownOutcome]);

  return (
    <form action={action} className="space-y-4" onSubmit={(event) => {
      if (pending || unknownOutcome || requestInFlight.current) {
        event.preventDefault();
        return;
      }
      const signature = submissionPayloadSignature(new FormData(event.currentTarget));
      setDraftSignature(signature);
      if (nonceConsumed) {
        event.preventDefault();
        return;
      }
      if (signature === confirmedPayload) {
        event.preventDefault();
        return;
      }
      const requestId = ++nextSubmissionId.current;
      activeSubmissionId.current = requestId;
      setCurrentSubmissionId(requestId);
      setSettledResult(null);
      requestInFlight.current = true;
      onSubmissionStart();
      submitPreservingInput(action)(event);
    }} onChange={(event) => {
      setDraftSignature(submissionPayloadSignature(new FormData(event.currentTarget)));
    }} ref={formRef}>
      <input name="submissionNonce" type="hidden" value={nonce} />
      <input name="bloodSugarUnit" type="hidden" value={PATIENT_SELF_MEASUREMENT_BLOOD_SUGAR_UNIT} />
      <fieldset className="space-y-4" disabled={pending || unknownOutcome}>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor={`${prefix}-time`}>วันและเวลาที่วัด</label>
          <Input defaultValue={defaultMeasuredAt} id={`${prefix}-time`} name="measuredAt" required type="datetime-local" />
          <p className="text-sm text-text-muted">เวลาประเทศไทย ไม่เป็นเวลาในอนาคต</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {NUMBER_FIELDS.map((field) => (
            <div className="space-y-2" key={field.name}>
              <label className="block text-sm font-medium" htmlFor={`${prefix}-${field.name}`}>{field.label}</label>
              <Input id={`${prefix}-${field.name}`} inputMode="decimal" max={1000000} min={0} name={field.name} step={field.step} type="number" />
              {field.name === "bloodSugar" ? (
                <p className="text-sm text-text-muted">กรอกเฉพาะค่าที่แสดงเป็น mg/dL หากเครื่องแสดง mmol/L อย่ากรอกค่านั้นตรง ๆ; สอบถามเจ้าหน้าที่หากไม่แน่ใจ</p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor={`${prefix}-note`}>บันทึกเพิ่มเติม (ไม่บังคับ)</label>
          <textarea className={`${inputClassName} py-3`} id={`${prefix}-note`} maxLength={1000} name="note" rows={3} />
        </div>
      </fieldset>
      <p className="text-sm text-text-muted">กรอกอย่างน้อยหนึ่งค่า ข้อมูลนี้ไม่แทนการวัดโดย อสม. หรือเจ้าหน้าที่</p>
      {currentError ? currentError.loginHref ? <PatientSelfSessionExpiredAlert href={currentError.loginHref} message={currentError.message} /> : <Alert role="alert" variant="danger">{currentError.message}</Alert> : null}
      {currentSuccess ? <div role="status"><Alert variant="success">{currentSuccess.message}</Alert></div> : null}
      {nonceConsumed ? <div role="status"><Alert variant="success">ระบบยืนยันการบันทึกล่าสุดแล้ว กำลังรอรหัสใหม่จากระบบก่อนรับรายการถัดไป</Alert></div> : null}
      <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
      {canStartNewRecord ? (
        <Button onClick={startNewRecord} type="button" variant="ghost">เริ่มบันทึกครั้งใหม่</Button>
      ) : (
        <Button disabled={pending || unknownOutcome || nonceConsumed || sameConfirmedDraft} loading={pending} type="submit">
          {pending ? "กำลังบันทึก..." : nonceConsumed ? "กำลังรอรหัสใหม่..." : "บันทึก"}
        </Button>
      )}
    </form>
  );
}

function DeleteForm({ measurementId }: { measurementId: string }): React.JSX.Element {
  const [state, action, pending] = useMutationActionState(deleteOwnPatientSelfMeasurementAction, idle);
  return (
    <ConfirmableActionForm
      action={action}
      confirmation={{
        title: "ลบรายการที่บันทึกเองนี้หรือไม่",
        description: "ลบได้ภายใน 24 ชั่วโมงหลังบันทึก รายการที่ลบจะไม่แสดงต่อ อสม. และเจ้าหน้าที่",
        confirmLabel: "ลบรายการ",
      }}
      outcome={state.status === "SUCCESS" ? "success" : state.status === "ERROR" ? "error" : "idle"}
      pending={pending}
      resultKey={state}
    >
      <input name="measurementId" type="hidden" value={measurementId} />
      <Button loading={pending} size="compact" type="submit" variant="danger">{pending ? "กำลังลบ..." : "ลบ"}</Button>
      {state.status === "ERROR" ? state.loginHref ? <PatientSelfSessionExpiredAlert href={state.loginHref} message={state.message} /> : <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
    </ConfirmableActionForm>
  );
}

function CreateDisclosure({ initiallyOpen, nonce, defaultMeasuredAt }: {
  initiallyOpen: boolean;
  nonce: string;
  defaultMeasuredAt: string;
}): React.JSX.Element {
  const details = useRef<HTMLDetailsElement>(null);
  const [initialOpen] = useState(initiallyOpen);
  // Lock synchronously on submit so the disclosure cannot close before pending state is committed.
  const critical = useRef(false);
  const [locked, setLocked] = useState(false);

  const onSubmissionStart = useCallback(() => {
    critical.current = true;
    setLocked(true);
    if (details.current) details.current.open = true;
  }, []);
  const onAttentionChange = useCallback((requiresAttention: boolean) => {
    critical.current = requiresAttention;
    setLocked(requiresAttention);
    if (requiresAttention && details.current) details.current.open = true;
  }, []);

  return <section aria-labelledby="measurement-create-heading">
    <details
      ref={details}
      className="group min-w-0 rounded-panel border border-border bg-surface"
      open={initialOpen}
      onToggle={(event) => {
        if (critical.current && !event.currentTarget.open) event.currentTarget.open = true;
      }}
    >
      <summary
        aria-disabled={locked || undefined}
        className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-panel px-5 py-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring sm:px-7 [&::-webkit-details-marker]:hidden"
        onClick={(event) => { if (critical.current) event.preventDefault(); }}
      >
        <span className="space-y-0.5">
          <span className="block font-semibold text-brand-strong" id="measurement-create-heading">บันทึกค่าใหม่</span>
          <span className="block text-sm text-text-muted">เพิ่มค่าที่คุณวัดเองในรายการที่บันทึกไว้</span>
        </span>
        <svg aria-hidden="true" className="size-5 shrink-0 text-brand-strong transition-transform group-open:rotate-180 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 20 20">
          <path d="m5 8 5 5 5-5" />
        </svg>
      </summary>
      <div className="space-y-4 border-t border-border px-5 pb-5 pt-5 sm:px-7 sm:pb-7">
        <p className="text-sm text-text-muted">รายการจะแสดงในประวัติเมื่อระบบยืนยันการบันทึกแล้ว</p>
        <CreateForm defaultMeasuredAt={defaultMeasuredAt} nonce={nonce} onAttentionChange={onAttentionChange} onSubmissionStart={onSubmissionStart} />
      </div>
    </details>
  </section>;
}

export function PatientSelfMeasurementWorkspace({ items, nonce, defaultMeasuredAt, nextCursor, hasCursor }: {
  items: readonly OwnPatientSelfMeasurement[];
  nonce: string;
  defaultMeasuredAt: string;
  nextCursor: string | null;
  hasCursor: boolean;
}): React.JSX.Element {
  return (
    <div className="min-w-0 max-w-3xl space-y-6">
      <PageHeader
        breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "ค่าที่วัดเอง" }]}
        description="บันทึกน้ำหนัก น้ำตาลในเลือด และความดันที่คุณวัดเอง อสม. และเจ้าหน้าที่ที่ดูแลคุณเห็นรายการนี้พร้อมป้ายผู้ป่วยบันทึกเอง"
        title="ค่าที่วัดเอง"
      />
      <CreateDisclosure defaultMeasuredAt={defaultMeasuredAt} initiallyOpen={items.length === 0} nonce={nonce} />
      <section aria-labelledby="measurement-history" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold" id="measurement-history">รายการที่บันทึกไว้</h2>
          <p className="mt-1 text-sm text-text-muted">แสดงสูงสุด {PATIENT_SELF_MEASUREMENT_OWN_PAGE_SIZE} รายการต่อหน้า</p>
        </div>
        {items.length === 0 ? (
          <SavedRecordEmpty>ยังไม่มีรายการที่บันทึกเอง คุณสามารถเริ่มบันทึกค่าใหม่ได้จากส่วนด้านบน</SavedRecordEmpty>
        ) : (
          <ul aria-label="ประวัติค่าวัดที่บันทึกเอง" className="space-y-3">
            {items.map((item) => (
              <PatientSelfMeasurementRecordCard as="li" item={item} key={item.measurementId}>
                {item.canDelete ? <DeleteForm measurementId={item.measurementId} /> : null}
              </PatientSelfMeasurementRecordCard>
            ))}
          </ul>
        )}
        {hasCursor || nextCursor ? (
          <nav aria-label="หน้าในประวัติการวัดด้วยตนเอง" className="mt-5 flex flex-wrap gap-3">
            {hasCursor ? (
              <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href="/app/personal/measurements#measurement-history">
                กลับไปรายการล่าสุด
              </Link>
            ) : null}
            {nextCursor ? (
              <Link
                className={buttonClassName({ variant: "secondary", size: "compact" })}
                href={`/app/personal/measurements?cursor=${encodeURIComponent(nextCursor)}#measurement-history`}
                prefetch={false}
                rel="next"
              >
                ดูรายการเก่ากว่า
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
