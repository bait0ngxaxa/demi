import { computeRoundStatus, roundPlan, type ProgramRoundFacts } from "@/modules/patient-program-rounds/domain/round-steps";
import { roundTitle } from "@/modules/patient-program-rounds/domain/round-catalog";

export type RoundReport = {
  roundNumber: number;
  title: string;
  completed: boolean;
  vitals?: { weight: number | null; bloodSugar: number | null } | null;
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
      patientRecordedItems: status.steps.filter((step) => step.status === "DONE" && step.evidence?.byPatient).length,
    };
  });
}

export function completedExtraRounds(rounds: readonly RoundReport[]): number {
  return rounds.filter((round) => round.roundNumber >= 7 && round.completed).length;
}
