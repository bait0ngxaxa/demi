"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { inputClassName } from "@/components/ui/input";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { RoundStepState } from "@/modules/patient-program-rounds/domain/round-steps";
import type { ProgramRoundDetail } from "@/modules/patient-program-rounds/services/round-query-service";
import {
  initialPatientProgramRoundActionState,
  type PatientProgramRoundActionState,
} from "@/modules/patient-program-rounds/transport/action-state";
import {
  addRoundPlanItemAction,
  removeRoundPlanItemAction,
  markCustomItemDoneAction,
  unmarkCustomItemDoneAction,
  addProgramRoundAction,
} from "@/modules/patient-program-rounds/transport/server-actions";

type Target = { patientHospitalRelationshipId: string; patientProgramId: string; roundNumber: number };
type Mutation = (
  previous: PatientProgramRoundActionState,
  data: FormData,
) => Promise<PatientProgramRoundActionState>;
type MutationStatus = "idle" | "busy" | "success";

function Inputs({ target, submissionNonce }: { target: Target; submissionNonce: string }): React.JSX.Element {
  return (
    <>
      <input type="hidden" name="patientProgramId" value={target.patientProgramId} />
      <input type="hidden" name="roundNumber" value={target.roundNumber} />
      <input type="hidden" name="submissionNonce" value={submissionNonce} />
    </>
  );
}

function MutationForm({
  mutation,
  target,
  submissionNonce,
  label,
  children,
  confirmation,
  onStatus,
  nextHref,
}: {
  mutation: Mutation;
  target: Target;
  submissionNonce: string;
  label: string;
  children?: React.ReactNode;
  confirmation?: string;
  onStatus?: (status: MutationStatus) => void;
  nextHref?: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<
    PatientProgramRoundActionState,
    FormData
  >(mutation, initialPatientProgramRoundActionState);

  useEffect(() => {
    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      if (state.status === "SUCCESS" && nextHref) router.push(nextHref);
      router.refresh();
    }
  }, [nextHref, router, state]);

  useEffect(() => {
    onStatus?.(pending || unknownOutcome ? "busy" : state.status === "SUCCESS" ? "success" : "idle");
  }, [onStatus, pending, unknownOutcome, state]);

  const contents = (
    <>
      <Inputs target={target} submissionNonce={submissionNonce} />
      <fieldset className="space-y-3" disabled={pending || unknownOutcome}>
        {children}
        <Button type="submit" variant="secondary" disabled={pending || unknownOutcome} loading={pending}>
          {label}
        </Button>
      </fieldset>
      {state.status === "ERROR" ? <Alert variant="warning">{state.message}</Alert> : null}
      <UnknownOutcomeAlert
        active={unknownOutcome}
        recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }}
      />
    </>
  );

  if (!confirmation) {
    return (
      <form action={action} onSubmit={submitPreservingInput(action)} className="space-y-3">
        {contents}
      </form>
    );
  }

  return (
    <ConfirmableActionForm
      action={action}
      className="space-y-3"
      confirmation={{
        title: confirmation,
        description: "เพิ่มกลับได้ภายหลัง โดยจะอยู่ท้ายแผน",
        confirmLabel: label,
      }}
      outcome={
        unknownOutcome
          ? "unknown"
          : state.status === "SUCCESS"
            ? "success"
            : state.status === "ERROR"
              ? "error"
              : "idle"
      }
      pending={pending}
      resultKey={state}
    >
      {contents}
    </ConfirmableActionForm>
  );
}

export function RoundPlanEditor({
  choices,
  target,
  submissionNonce,
}: {
  choices: NonNullable<ProgramRoundDetail["planChoices"]>;
  target: Target;
  submissionNonce: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const onStatus = useCallback((status: MutationStatus) => {
    setBusy(status === "busy");

    if (status === "success") {
      setOpen(false);
    }
  }, []);
  const recommended = choices.filter((item) => item.recommended);

  return (
    <div className="space-y-3">
      <Button type="button" onClick={() => setOpen(true)}>
        เพิ่มรายการ
      </Button>
      {recommended.length ? (
        <div>
          <h2 className="text-sm font-semibold text-text">แนวทางครั้งนี้แนะนำ</h2>
          <ul className="space-y-2">
            {recommended.map((item) => (
              <li key={item.code} className="flex flex-wrap items-center gap-3 text-sm">
                <span>{item.label}</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSelected(item.code);
                    setOpen(true);
                  }}
                >
                  เพิ่มกลับ
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {open ? (
        <ModalDialog title="เพิ่มรายการในแผนครั้งนี้" dismissible={!busy} onRequestClose={() => setOpen(false)}>
          <MutationForm
            onStatus={onStatus}
            key={selected}
            mutation={addRoundPlanItemAction}
            target={target}
            submissionNonce={submissionNonce}
            label="เพิ่มในแผน"
          >
            <label className="block space-y-2 text-sm font-semibold">
              <span>รายการ</span>
              <select
                className={inputClassName}
                name="stepCode"
                value={selected}
                required
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">เลือกรายการ</option>
                {choices.map((item) => (
                  <option key={item.code} value={item.code} disabled={item.unavailableReason !== null}>
                    {item.label}
                    {item.unavailableReason ? ` — ${item.unavailableReason}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {selected === "CUSTOM" ? (
              <label className="block space-y-2 text-sm font-semibold">
                <span>ชื่อรายการ (ไม่เกิน 120 ตัวอักษร)</span>
                <input className={inputClassName} name="customTitle" required maxLength={120} />
              </label>
            ) : null}
          </MutationForm>
        </ModalDialog>
      ) : null}
    </div>
  );
}

export function CustomItemDoneForm({
  planItemId,
  target,
  submissionNonce,
  nextHref,
}: {
  planItemId: string;
  target: Target;
  submissionNonce: string;
  nextHref?: string;
}): React.JSX.Element {
  return (
    <MutationForm mutation={markCustomItemDoneAction} target={target} submissionNonce={submissionNonce} label="ทำแล้ว" nextHref={nextHref}>
      <input type="hidden" name="planItemId" value={planItemId} />
      <label className="block space-y-2 text-sm font-semibold">
        <span>หมายเหตุ (ไม่บังคับ ไม่เกิน 500 ตัวอักษร)</span>
        <textarea className={`${inputClassName} min-h-24 py-3`} name="note" maxLength={500} rows={3} />
      </label>
    </MutationForm>
  );
}

export function PlanItemControl({
  step,
  target,
  submissionNonce,
}: {
  step: RoundStepState;
  target: Target;
  submissionNonce: string;
}): React.JSX.Element | null {
  if (!step.planItemId) {
    return null;
  }

  return (
    <div className="mt-4 space-y-4">
      {step.code === "CUSTOM" ? (
        step.status === "DONE" ? (
          <MutationForm
            mutation={unmarkCustomItemDoneAction}
            target={target}
            submissionNonce={submissionNonce}
            label="ยกเลิกทำแล้ว"
          >
            <input type="hidden" name="planItemId" value={step.planItemId} />
          </MutationForm>
        ) : (
          <CustomItemDoneForm planItemId={step.planItemId} target={target} submissionNonce={submissionNonce} />
        )
      ) : null}
      {step.status === "TODO" ? (
        <MutationForm
          mutation={removeRoundPlanItemAction}
          target={target}
          submissionNonce={submissionNonce}
          label="ตัดออก"
          confirmation={`ตัด “${step.label}” ออกจากแผนหรือไม่`}
        >
          <input type="hidden" name="planItemId" value={step.planItemId} />
        </MutationForm>
      ) : null}
    </div>
  );
}

export function AddProgramRoundControl({
  target,
  submissionNonce,
}: {
  target: Target;
  submissionNonce: string;
}): React.JSX.Element {
  return (
    <MutationForm
      mutation={addProgramRoundAction}
      target={target}
      submissionNonce={submissionNonce}
      label="เพิ่มครั้งบริการ"
    />
  );
}
