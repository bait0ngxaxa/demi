"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/input";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { Panel } from "@/components/ui/panel";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { RoundAchieveScoreView } from "@/modules/patient-program-rounds/services/round-query-service";
import {
  initialPatientProgramRoundActionState,
  type PatientProgramRoundActionState,
} from "@/modules/patient-program-rounds/transport/action-state";
import { recordRoundAchieveScoreAction } from "@/modules/patient-program-rounds/transport/server-actions";

function percentText(value: number): string {
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
}

/** AS-1: the hospital's own Achieve score of this round (staff only); blank clears it. */
export function RoundAchieveScoreForm({
  achieveScore,
  submissionNonce,
  target,
}: {
  achieveScore: RoundAchieveScoreView;
  submissionNonce: string;
  target: { patientHospitalRelationshipId: string; patientProgramId: string; roundNumber: number };
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramRoundActionState, FormData>(
    recordRoundAchieveScoreAction,
    initialPatientProgramRoundActionState,
  );
  const inputId = `round-${target.roundNumber}-achieve-score`;
  const hint =
    achieveScore.computedRatePercent !== null
      ? `อัตราที่คำนวณจากการติดตามผลของครั้งนี้: ${percentText(achieveScore.computedRatePercent)} (ใช้ในรายงานเมื่อไม่ได้กรอกคะแนน)`
      : null;

  useEffect(() => {
    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <Panel>
      <h2 className="text-lg font-semibold text-text">Achieve score ของครั้งนี้</h2>
      <p className="mt-1 text-sm leading-6 text-text-muted">
        คะแนนที่โรงพยาบาลประเมินเอง ใช้ในรายงาน และไม่แสดงให้ผู้ป่วยเห็น
      </p>
      {achieveScore.editable ? (
        <form action={action} className="mt-4 space-y-3" onSubmit={submitPreservingInput(action)}>
          <input name="patientHospitalRelationshipId" type="hidden" value={target.patientHospitalRelationshipId} />
          <input name="patientProgramId" type="hidden" value={target.patientProgramId} />
          <input name="roundNumber" type="hidden" value={target.roundNumber} />
          <input name="submissionNonce" type="hidden" value={submissionNonce} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor={inputId}>
              <span>Achieve score (%)</span>
              <input
                aria-describedby={hint ? `${inputId}-hint` : undefined}
                className={`${inputClassName} sm:w-40`}
                defaultValue={achieveScore.score ?? ""}
                disabled={pending || unknownOutcome}
                id={inputId}
                inputMode="decimal"
                max={100}
                min={0}
                name="score"
                step={0.1}
                type="number"
              />
            </label>
            <Button disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit" variant="secondary">
              {pending ? "กำลังบันทึก…" : "บันทึก Achieve score"}
            </Button>
          </div>
          {hint ? <p className="text-sm text-text-muted" id={`${inputId}-hint`}>{hint}</p> : null}
          <p className="text-xs text-text-subtle">ร้อยละ 0–100 ทศนิยม 1 ตำแหน่ง เว้นว่างแล้วบันทึกเพื่อล้างคะแนน</p>
          {state.status === "ERROR" ? (
            <Alert variant={state.code === "CONFLICT" ? "warning" : "danger"}>{state.message}</Alert>
          ) : null}
          {state.status === "SUCCESS" ? <Alert variant="success">บันทึก Achieve score แล้ว</Alert> : null}
          <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
        </form>
      ) : (
        <div className="mt-4 space-y-1 text-sm">
          <p className="font-semibold text-text">
            Achieve score: {achieveScore.score !== null ? percentText(achieveScore.score) : "ยังไม่บันทึก"}
          </p>
          {hint ? <p className="text-text-muted">{hint}</p> : null}
        </div>
      )}
    </Panel>
  );
}
