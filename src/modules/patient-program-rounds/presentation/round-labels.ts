import type { RoundState, RoundStepState } from "../domain/round-steps";
import { ROUND_SKIP_REASON_LABELS, ROUND_SUMMARY_STEP } from "../domain/round-steps";

export function formatRoundDate(value: Date | null): string {
  return value
    ? new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(value)
    : "ไม่ระบุวันที่";
}

export function formatRoundNumber(value: number | null, fractionDigits = 1): string {
  return value === null
    ? "ไม่ได้บันทึก"
    : new Intl.NumberFormat("th-TH", { maximumFractionDigits: fractionDigits }).format(value);
}

export const ROUND_STATE_LABELS: Readonly<Record<RoundState, string>> = {
  COMPLETED: "เสร็จแล้ว",
  IN_PROGRESS: "กำลังทำ",
  NOT_STARTED: "ยังไม่เริ่ม",
  LOCKED: "ยังเปิดไม่ได้",
};

export function roundLockedLabel(roundNumber: number): string {
  return `ต้องจบครั้งที่ ${roundNumber - 1} ก่อน`;
}

export function roundStepStatusLabel(step: RoundStepState): string {
  switch (step.status) {
    case "DONE":
      return "บันทึกแล้ว";
    case "SKIPPED":
      return step.skip ? `ข้าม · ${ROUND_SKIP_REASON_LABELS[step.skip.reasonCode]}` : "ข้าม";
    case "LOCKED":
      return "ยังเปิดไม่ได้";
    default:
      return "ยังไม่ได้บันทึก";
  }
}

export function roundSkipDescription(step: RoundStepState): string | null {
  if (!step.skip) {
    return null;
  }

  const reason = ROUND_SKIP_REASON_LABELS[step.skip.reasonCode];
  return step.skip.note ? `${reason}: ${step.skip.note}` : reason;
}

export function buildPatientRoundsPath(relationshipId: string, programId: string): string {
  return `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/rounds`;
}

export function buildPatientRoundPath(
  relationshipId: string,
  programId: string,
  roundNumber: number,
): string {
  return `${buildPatientRoundsPath(relationshipId, programId)}/${roundNumber}`;
}

/** R1-D: a step of the stepper, or the summary. */
export function buildRoundStepPath(
  relationshipId: string,
  programId: string,
  roundNumber: number,
  stepCode: string,
): string {
  return `${buildPatientRoundPath(relationshipId, programId, roundNumber)}?step=${encodeURIComponent(stepCode)}`;
}

/** SR-D7: where to land after saving `stepCode` (the page resolves the next unresolved step). */
export function buildRoundAfterStepPath(
  relationshipId: string,
  programId: string,
  roundNumber: number,
  stepCode: string,
): string {
  return `${buildPatientRoundPath(relationshipId, programId, roundNumber)}?after=${encodeURIComponent(stepCode)}`;
}

export { ROUND_SUMMARY_STEP };
