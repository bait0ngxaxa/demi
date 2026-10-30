import { computeRoundStatus, roundPlan, ROUND_ITEM_CATALOG, type ProgramRoundFacts } from "@/modules/patient-program-rounds/domain/round-steps";
import { roundTitle } from "@/modules/patient-program-rounds/domain/round-catalog";

export type RoundReport = {
  roundNumber: number;
  title: string;
  completed: boolean;
  vitals?: { weight: number | null; bloodSugar: number | null } | null;
  /** AS-1: the hospital's staff-entered Achieve score %, one decimal; null when not recorded. */
  achieveScore?: number | null;
  /** Rounds 3-12: the round's Program Follow-up with its BR-04 rate (null when not scorable); null without one. */
  followup?: { ratePercent: number | null } | null;
  doneItems: number;
  plannedItems: number;
  skippedItems: number;
  notDoneAtCloseItems: number;
  patientRecordedItems: number;
};

/** Uses the same active plan, evidence and frozen skips as the service completion guard. */
export function projectRoundReports(facts: ProgramRoundFacts): RoundReport[] {
  return Object.keys(facts.rounds).map(Number).sort((left, right) => left - right).map((roundNumber) => {
    const status = computeRoundStatus(facts, roundNumber, roundPlan(facts, roundNumber));
    return {
      roundNumber, title: roundTitle(roundNumber), completed: status.completion !== null,
      doneItems: status.steps.filter((step) => step.status === "DONE").length,
      plannedItems: status.steps.length,
      skippedItems: status.steps.filter((step) => step.status === "SKIPPED").length,
      notDoneAtCloseItems: status.steps.filter((step) => step.skip?.reasonCode === "NOT_DONE_AT_CLOSE").length,
      patientRecordedItems: status.steps.filter((step) => step.status === "DONE" && ROUND_ITEM_CATALOG[step.code].patientRecordable && step.evidence?.byPatient).length,
    };
  });
}

/**
 * AS-1 Achieve score of one round for the reports: the staff-entered score wins (AS-D1); rounds 3+ without one
 * fall back to the Follow-up rate; a completed round 3+ without a Follow-up is NO_FOLLOWUP (AS-D3). Rounds 1-2
 * have no computed score (AS-D2).
 */
export type RoundAchieveScore =
  | { kind: "STAFF"; percent: number }
  | { kind: "FOLLOWUP"; percent: number }
  | { kind: "FOLLOWUP_NOT_SCORABLE" }
  | { kind: "NO_FOLLOWUP" }
  | { kind: "NOT_RECORDED" };

export const NO_FOLLOWUP_LABEL = "ครั้งนี้ไม่ได้ติดตามผล";

export function roundAchieveScore(round: RoundReport | undefined): RoundAchieveScore {
  if (!round) return { kind: "NOT_RECORDED" };
  if (round.achieveScore != null) return { kind: "STAFF", percent: round.achieveScore };
  if (round.roundNumber < 3) return { kind: "NOT_RECORDED" };
  if (round.followup) {
    return round.followup.ratePercent === null
      ? { kind: "FOLLOWUP_NOT_SCORABLE" }
      : { kind: "FOLLOWUP", percent: round.followup.ratePercent };
  }
  return round.completed ? { kind: "NO_FOLLOWUP" } : { kind: "NOT_RECORDED" };
}

/** AS-D3: a completed round 3+ that ended without its Program Follow-up. */
export function roundEndedWithoutFollowup(round: RoundReport | undefined): boolean {
  return Boolean(round && round.roundNumber >= 3 && round.completed && !round.followup);
}

export function roundAchieveScoreText(score: RoundAchieveScore): string {
  switch (score.kind) {
    case "STAFF": return `${score.percent.toLocaleString("th-TH", { maximumFractionDigits: 1 })}% (โรงพยาบาลประเมิน)`;
    case "FOLLOWUP": return `${score.percent}% (คำนวณจากการติดตามผล)`;
    case "FOLLOWUP_NOT_SCORABLE": return "ไม่มีข้อมูลจำนวนวันที่ทำได้ที่คำนวณได้";
    case "NO_FOLLOWUP": return NO_FOLLOWUP_LABEL;
    case "NOT_RECORDED": return "ยังไม่บันทึก";
  }
}

export function completedExtraRounds(rounds: readonly RoundReport[]): number {
  return rounds.filter((round) => round.roundNumber >= 7 && round.completed).length;
}
