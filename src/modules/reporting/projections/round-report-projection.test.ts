import { describe, expect, it } from "vitest";
import type { ProgramRoundFacts, RoundPlanItemFact } from "@/modules/patient-program-rounds/domain/round-steps";
import { completedExtraRounds, projectRoundReports } from "./round-report-projection";

const now = new Date("2026-10-28T00:00:00Z");
function facts(count: number): ProgramRoundFacts {
  const result: ProgramRoundFacts = { programActive: true, preferredName: null, screenings: { PAM: null, PROMS: null }, roundVitals: {}, followups: {}, tools: { CONFIDENCE_RULER: {}, ROUTINE: {}, FLOATING_CHART: {}, DREAM_CARD: {} }, firstGoalPlan: null, healthPathReviewed: null, completions: {}, skips: {}, rounds: {} };
  for (let round = 1; round <= count; round += 1) {
    const done: RoundPlanItemFact = { id: `done-${round}`, stepCode: "CUSTOM", customTitle: "ทำแล้ว", position: 1, removed: false, done: { at: now, byDisplayName: null, byPatient: true } };
    result.rounds[round] = { planItems: [done, { ...done, id: `todo-${round}`, position: 2, done: null }, { ...done, id: `removed-${round}`, position: 3, removed: true }] };
    result.completions[round] = { completedAt: now, completedByDisplayName: null };
    result.skips[round] = [{ planItemId: `todo-${round}`, stepCode: "CUSTOM", reasonCode: "NOT_DONE_AT_CLOSE", note: null, at: now, byDisplayName: null }];
  }
  return result;
}

describe("flexible round report projection", () => {
  it.each([6, 8, 12])("reports all %i opened rounds without counting removed items or hiding not-done skips", (count) => {
    const rounds = projectRoundReports(facts(count));
    expect(rounds.map((round) => round.roundNumber)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(completedExtraRounds(rounds)).toBe(count - 6);
    expect(rounds.every((round) => round.doneItems === 1 && round.plannedItems === 2 && round.skippedItems === 1 && round.notDoneAtCloseItems === 1 && round.patientRecordedItems === 1)).toBe(true);
  });
  it("counts a derived health-path item as DONE without counting it as a patient recording action", () => {
    const source = facts(1);
    source.rounds[1] = { planItems: [...(source.rounds[1]?.planItems ?? []), { id: "derived", stepCode: "HEALTH_PATH", customTitle: null, position: 4, removed: false, done: null }] };
    source.roundVitals[1] = { at: now, byDisplayName: null, byPatient: true, recordedAt: now, measurements: ["weight"] };
    expect(projectRoundReports(source)[0]).toMatchObject({ doneItems: 2, patientRecordedItems: 1 });
  });

  it("counts completed extra rounds only, including an opened empty plan in detail", () => {
    const source = facts(8); delete source.completions[8]; source.rounds[8] = { planItems: [] }; source.skips[8] = [];
    const rounds = projectRoundReports(source);
    expect(completedExtraRounds(rounds)).toBe(1);
    expect(rounds[7]).toMatchObject({ completed: false, plannedItems: 0, doneItems: 0, notDoneAtCloseItems: 0 });
  });
});
