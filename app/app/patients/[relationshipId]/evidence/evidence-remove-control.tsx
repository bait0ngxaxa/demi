"use client";

import { startTransition, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { inputClassName } from "@/components/ui/input";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { notify } from "@/components/ui/notify";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { PATIENT_EVIDENCE_REMOVAL_REASON_MAX_LENGTH } from "@/modules/patient-evidence/schemas/patient-evidence-schemas";
import {
  removePatientEvidenceArtifactAction,
  type PatientEvidenceRemoveActionState,
} from "@/modules/patient-evidence/transport/patient-evidence-server-actions";

const initialState: PatientEvidenceRemoveActionState = { status: "IDLE", message: "" };

/** N4 (ADR-0034): remove one evidence photo with a required reason; shown only when the page context allows it. */
export function PatientEvidenceRemoveControl({
  relationshipId,
  artifactId,
  removeAction = removePatientEvidenceArtifactAction,
}: {
  relationshipId: string;
  artifactId: string;
  removeAction?: typeof removePatientEvidenceArtifactAction;
}): React.JSX.Element {
  const id = useId();
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [dismissedState, setDismissedState] = useState<PatientEvidenceRemoveActionState | null>(null);
  const [recoveryKey, setRecoveryKey] = useState(0);

  const [state, dispatch, pending, unknownOutcome] = useMutationActionState<PatientEvidenceRemoveActionState, FormData>(
    async (previous, formData) => {
      const result = await removeAction(relationshipId, artifactId, previous, formData);

      if (result.status === "SUCCESS") {
        notify.success("ลบรูปหลักฐานแล้ว");
        setOpen(false);
        // The list is re-read in place; the removed photo is no longer returned.
        router.refresh();
      } else if (result.status === "ERROR" && result.code === "INVALID_INPUT") {
        // Nothing was written, so the user may correct the reason and confirm again.
        setRecoveryKey((key) => key + 1);
      }

      return result;
    },
    initialState,
  );

  const trimmedReason = reason.trim();
  const visibleError = state.status === "ERROR" && state !== dismissedState ? state : null;

  function openDialog(): void {
    setDismissedState(state);
    setOpen(true);
  }

  function closeDialog(): void {
    if (pending) {
      return;
    }

    setDismissedState(state);
    setOpen(false);
  }

  function confirmRemoval(): void {
    const formData = new FormData();
    formData.set("reason", trimmedReason);
    startTransition(() => dispatch(formData));
  }

  return (
    <>
      <Button
        className="w-full"
        onClick={openDialog}
        ref={triggerRef}
        size="compact"
        type="button"
        variant="ghost"
      >
        ลบรูป
      </Button>
      <ConfirmDialog
        confirmDisabled={trimmedReason.length === 0 || unknownOutcome}
        confirmLabel="ลบรูป"
        confirmVariant="destructive"
        description="รูปจะไม่แสดงในประวัติของผู้ป่วยอีก และไม่สามารถกู้คืนได้ ระบบเก็บชื่อผู้ลบ เวลา และเหตุผลไว้"
        details={
          <>
            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor={`${id}-reason`}>
              <span>เหตุผลที่ลบ</span>
              <textarea
                className={`${inputClassName} min-h-24 py-3`}
                disabled={pending || unknownOutcome}
                id={`${id}-reason`}
                maxLength={PATIENT_EVIDENCE_REMOVAL_REASON_MAX_LENGTH}
                name="reason"
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="เช่น อัปโหลดผิดผู้ป่วย"
                required
                rows={3}
                value={reason}
              />
              <span className="text-xs font-normal leading-5 text-text-muted">
                ไม่เกิน {PATIENT_EVIDENCE_REMOVAL_REASON_MAX_LENGTH} ตัวอักษร
              </span>
            </label>
            {visibleError ? <Alert role="alert" variant="warning">{visibleError.message}</Alert> : null}
            <UnknownOutcomeAlert
              active={unknownOutcome}
              recovery={{ kind: "reload", message: "ระบบยังยืนยันผลการลบรูปไม่ได้ ดูรายการล่าสุดก่อนลองอีกครั้ง" }}
            />
          </>
        }
        onCancel={closeDialog}
        onConfirm={confirmRemoval}
        open={open}
        pending={pending}
        pendingLabel="กำลังลบรูป…"
        recoveryKey={recoveryKey}
        returnFocusTarget={() => triggerRef.current}
        title="ลบรูปหลักฐานนี้?"
      />
    </>
  );
}
