"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm, type ConfirmableActionOutcome } from "@/components/ui/confirmable-action-form";
import { inputClassName } from "@/components/ui/input";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { ROUND_SKIP_REASON_LABELS, type RoundStepState } from "@/modules/patient-program-rounds/domain/round-steps";
import {
  initialPatientProgramRoundActionState,
  type PatientProgramRoundActionState,
} from "@/modules/patient-program-rounds/transport/action-state";
import {
  completePatientProgramRoundAction,
  recordPatientProgramRoundProfileAction,
  skipPatientProgramRoundStepAction,
  unskipPatientProgramRoundStepAction,
} from "@/modules/patient-program-rounds/transport/server-actions";

type RoundTarget = {
  patientHospitalRelationshipId: string;
  patientProgramId: string;
  roundNumber: number;
};

function RoundTargetInputs({ target }: { target: RoundTarget }): React.JSX.Element {
  return (
    <>
      <input name="patientHospitalRelationshipId" type="hidden" value={target.patientHospitalRelationshipId} />
      <input name="patientProgramId" type="hidden" value={target.patientProgramId} />
      <input name="roundNumber" type="hidden" value={target.roundNumber} />
    </>
  );
}

function ActionError({ state }: { state: PatientProgramRoundActionState }): React.JSX.Element | null {
  return state.status === "ERROR" ? (
    <Alert variant={state.code === "CONFLICT" ? "warning" : "danger"}>{state.message}</Alert>
  ) : null;
}

/** Moves to `nextHref` after a confirmed write, or refreshes on a conflict so the latest state shows. */
function useAfterWrite(state: PatientProgramRoundActionState, nextHref: string | null): void {
  const router = useRouter();

  useEffect(() => {
    if (state.status === "SUCCESS") {
      if (nextHref) {
        router.push(nextHref);
      } else {
        router.refresh();
      }
      return;
    }

    if (state.status === "ERROR" && state.code === "CONFLICT") {
      router.refresh();
    }
  }, [nextHref, router, state]);
}

/** SR-D12: "รู้จักตัวฉันเอง" = the preferred name; an empty occupation can be filled at the same time. */
export function RoundProfileForm({
  nextHref,
  occupation,
  preferredName,
  profileVersion,
  patientMode = false,
  submissionNonce,
  target,
}: {
  nextHref: string;
  occupation: string | null;
  preferredName: string | null;
  profileVersion: number | null;
  patientMode?: boolean;
  submissionNonce?: string;
  target: RoundTarget;
}): React.JSX.Element {
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramRoundActionState, FormData>(
    recordPatientProgramRoundProfileAction,
    initialPatientProgramRoundActionState,
  );
  useAfterWrite(state, nextHref);

  return (
    <form action={action} className="space-y-5" onSubmit={submitPreservingInput(action)}>
      <RoundTargetInputs target={target} />
      <input name="profileVersion" type="hidden" value={profileVersion ?? ""} />
      {submissionNonce ? <input name="submissionNonce" type="hidden" value={submissionNonce} /> : null}
      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={pending || unknownOutcome}>
        <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="round-know-self-preferred-name">
          <span>ชื่อที่อยากให้เรียก</span>
          <input
            className={inputClassName}
            defaultValue={preferredName ?? ""}
            id="round-know-self-preferred-name"
            maxLength={100}
            name="preferredName"
            required
            type="text"
          />
        </label>
        {occupation || patientMode ? null : (
          <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="round-know-self-occupation">
            <span>อาชีพ (ไม่บังคับ)</span>
            <input className={inputClassName} id="round-know-self-occupation" maxLength={200} name="occupation" type="text" />
          </label>
        )}
      </fieldset>
      <ActionError state={state} />
      <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
      <Button disabled={pending || unknownOutcome} loading={pending} type="submit">
        {pending ? "กำลังบันทึก…" : patientMode ? "บันทึกชื่อที่อยากให้เรียก" : "บันทึกและไปขั้นตอนถัดไป"}
      </Button>
    </form>
  );
}

const SKIP_REASONS = Object.entries(ROUND_SKIP_REASON_LABELS).filter(([code]) => code !== "NOT_DONE_AT_CLOSE") as [keyof typeof ROUND_SKIP_REASON_LABELS, string][];

/** SR-D3: skip a checklist step with a reason; OTHER needs a note (≤ 500 characters). */
export function SkipStepControl({
  nextHref,
  planItemId,
  stepLabel,
  target,
}: {
  nextHref: string;
  /** ADR-0022 (FR-1b): the skip belongs to this plan item. */
  planItemId: string;
  stepLabel: string;
  target: RoundTarget;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramRoundActionState, FormData>(
    skipPatientProgramRoundStepAction,
    initialPatientProgramRoundActionState,
  );
  useAfterWrite(state, nextHref);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="compact" type="button" variant="ghost">
        ข้ามรายการนี้
      </Button>
      {open ? (
        <ModalDialog
          description="ระบุเหตุผลที่ไม่ได้ทำรายการนี้ในครั้งนี้ รายการที่ข้ามจะแสดงในประวัติและสรุปของครั้งนี้ และบันทึกผลแทนได้จนกว่าจะจบบริการครั้งนี้"
          dismissible={!pending}
          onRequestClose={() => setOpen(false)}
          size="compact"
          title={`ข้าม “${stepLabel}”`}
        >
          <form action={action} className="space-y-5" onSubmit={submitPreservingInput(action)}>
            <RoundTargetInputs target={target} />
            <input name="planItemId" type="hidden" value={planItemId} />
            <fieldset className="space-y-2" disabled={pending || unknownOutcome}>
              <legend className="text-sm font-semibold text-text">เหตุผล</legend>
              {SKIP_REASONS.map(([code, label]) => (
                <label className="flex min-h-11 items-center gap-3 rounded-control border border-border px-3 text-sm text-text" key={code}>
                  <input
                    checked={reason === code}
                    name="reasonCode"
                    onChange={() => setReason(code)}
                    required
                    type="radio"
                    value={code}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor={`skip-note-${planItemId}`}>
              <span>รายละเอียด{reason === "OTHER" ? " (ต้องระบุ)" : " (ไม่บังคับ)"}</span>
              <textarea
                className={`${inputClassName} min-h-24 py-3`}
                disabled={pending || unknownOutcome}
                id={`skip-note-${planItemId}`}
                maxLength={500}
                name="note"
                required={reason === "OTHER"}
                rows={3}
              />
              <span className="text-xs font-normal text-text-muted">ไม่เกิน 500 ตัวอักษร</span>
            </label>
            <ActionError state={state} />
            <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
            <div className="flex flex-wrap justify-end gap-3">
              <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="secondary">
                ยกเลิก
              </Button>
              <Button disabled={pending || unknownOutcome || !reason} loading={pending} type="submit">
                {pending ? "กำลังบันทึก…" : "บันทึกการข้าม"}
              </Button>
            </div>
          </form>
        </ModalDialog>
      ) : null}
    </>
  );
}

/** SR-D3: recording the step replaces a skip; this removes the skip without recording. */
export function UnskipStepControl({ planItemId, target }: { planItemId: string; target: RoundTarget }): React.JSX.Element {
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramRoundActionState, FormData>(
    unskipPatientProgramRoundStepAction,
    initialPatientProgramRoundActionState,
  );
  useAfterWrite(state, null);

  return (
    <form action={action} className="space-y-2">
      <RoundTargetInputs target={target} />
      <input name="planItemId" type="hidden" value={planItemId} />
      <Button disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit" variant="secondary">
        {pending ? "กำลังยกเลิก…" : "ยกเลิกการข้าม"}
      </Button>
      <ActionError state={state} />
      <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
    </form>
  );
}

function toOutcome(state: PatientProgramRoundActionState): ConfirmableActionOutcome {
  return state.status === "SUCCESS" ? "success" : state.status === "ERROR" ? "error" : "idle";
}

/** SR-D4: "จบบริการครั้งที่ n" after confirming that the round becomes read-only. */
export function CompleteRoundControl({
  roundsHref,
  steps = [],
  submissionNonce,
  target,
}: {
  roundsHref: string;
  steps?: readonly RoundStepState[];
  submissionNonce: string;
  target: RoundTarget;
}): React.JSX.Element {
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramRoundActionState, FormData>(
    completePatientProgramRoundAction,
    initialPatientProgramRoundActionState,
  );
  useAfterWrite(state, roundsHref);

  return (
    <ConfirmableActionForm
      action={action}
      className="space-y-3"
      confirmation={{
        title: `จบบริการครั้งที่ ${target.roundNumber} หรือไม่`,
        description: "เมื่อจบแล้ว ข้อมูลของครั้งนี้จะเป็นแบบอ่านอย่างเดียว แก้ไข เพิ่ม หรือยกเลิกการข้ามไม่ได้อีก",
        details: <div className="space-y-3">{(["DONE", "SKIPPED", "TODO"] as const).map((status) => <div key={status}><h3 className="font-semibold">{status === "DONE" ? "ทำแล้ว" : status === "SKIPPED" ? "ข้ามแล้ว" : "ยังไม่ได้ทำเมื่อจบบริการ"} ({steps.filter((step) => step.status === status).length})</h3><ul className="list-disc pl-5">{steps.filter((step) => step.status === status).map((step) => <li key={step.planItemId ?? step.code}>{step.label}</li>)}</ul></div>)}<p>รายการที่ยังไม่ได้ทำจะถูกบันทึกเป็น “ยังไม่ได้ทำเมื่อจบบริการ”</p></div>,
        confirmLabel: `จบบริการครั้งที่ ${target.roundNumber}`,
      }}
      outcome={unknownOutcome ? "unknown" : toOutcome(state)}
      pending={pending}
      resultKey={state}
    >
      <RoundTargetInputs target={target} />
      <input name="submissionNonce" type="hidden" value={submissionNonce} />
      <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
      <Button disabled={pending || unknownOutcome} loading={pending} type="submit">
        {pending ? "กำลังบันทึก…" : `จบบริการครั้งที่ ${target.roundNumber}`}
      </Button>
      <ActionError state={state} />
      {state.status === "SUCCESS" ? <Alert variant="success">จบบริการครั้งนี้แล้ว</Alert> : null}
    </ConfirmableActionForm>
  );
}
