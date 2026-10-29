import { describe, expect, it } from "vitest";

import {
  ACTIVE_CARE_STAGES,
  CARE_STAGE_LABELS,
  CARE_STAGES,
  CARE_STALE_DAYS,
  deriveCareSignals,
  deriveCareStage,
  hasAnyCareSignal,
  type CareCoarseFacts,
  type CareStage,
} from "./care-stage";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-29T03:00:00.000Z");

function facts(overrides: Partial<CareCoarseFacts> = {}): CareCoarseFacts {
  return { careEnded: false, baselineRecorded: false, activeProgram: null, completedProgramExists: false, ...overrides };
}

function program(overrides: Partial<NonNullable<CareCoarseFacts["activeProgram"]>> = {}): CareCoarseFacts["activeProgram"] {
  return { openedRounds: 1, completedRounds: 0, currentOpenRound: 1, finalAssessmentRecorded: false, ...overrides };
}

describe("deriveCareStage", () => {
  it.each<{ label: string; input: CareCoarseFacts; expected: CareStage }>([
    { label: "no Baseline and no Program", input: facts(), expected: "NOT_STARTED" },
    { label: "a Baseline without a Program", input: facts({ baselineRecorded: true }), expected: "READY_FOR_PROGRAM" },
    { label: "round 1 open", input: facts({ activeProgram: program() }), expected: "IN_ROUND" },
    { label: "an active Program without a Baseline", input: facts({ baselineRecorded: false, activeProgram: program() }), expected: "IN_ROUND" },
    { label: "round 6 open", input: facts({ activeProgram: program({ openedRounds: 6, completedRounds: 5, currentOpenRound: 6 }) }), expected: "IN_ROUND" },
    { label: "round 7 open", input: facts({ activeProgram: program({ openedRounds: 7, completedRounds: 6, currentOpenRound: 7 }) }), expected: "IN_EXTRA_ROUND" },
    { label: "round 12 open", input: facts({ activeProgram: program({ openedRounds: 12, completedRounds: 11, currentOpenRound: 12 }) }), expected: "IN_EXTRA_ROUND" },
    { label: "six opened rounds all completed", input: facts({ activeProgram: program({ openedRounds: 6, completedRounds: 6, currentOpenRound: null }) }), expected: "AWAITING_AFTER" },
    { label: "seven opened rounds all completed", input: facts({ activeProgram: program({ openedRounds: 7, completedRounds: 7, currentOpenRound: null }) }), expected: "AWAITING_AFTER" },
    { label: "twelve opened rounds all completed", input: facts({ activeProgram: program({ openedRounds: 12, completedRounds: 12, currentOpenRound: null }) }), expected: "AWAITING_AFTER" },
    { label: "five opened rounds all completed (next round not opened)", input: facts({ activeProgram: program({ openedRounds: 5, completedRounds: 5, currentOpenRound: null }) }), expected: "IN_ROUND" },
    { label: "an active Program with no opened round", input: facts({ activeProgram: program({ openedRounds: 0, completedRounds: 0, currentOpenRound: null }) }), expected: "IN_ROUND" },
    { label: "Final Assessment recorded while the Program is active", input: facts({ activeProgram: program({ openedRounds: 6, completedRounds: 6, currentOpenRound: null, finalAssessmentRecorded: true }) }), expected: "AWAITING_PROGRAM_END" },
    { label: "a completed Program and no active one", input: facts({ baselineRecorded: true, completedProgramExists: true }), expected: "PROGRAM_COMPLETED" },
    { label: "a new active Program after a completed one", input: facts({ completedProgramExists: true, activeProgram: program() }), expected: "IN_ROUND" },
    { label: "ended care, even with an active Program", input: facts({ careEnded: true, baselineRecorded: true, activeProgram: program() }), expected: "CARE_ENDED" },
  ])("returns $expected for $label", ({ input, expected }) => {
    expect(deriveCareStage(input)).toBe(expected);
  });

  it("labels every stage in Thai", () => {
    expect(Object.keys(CARE_STAGE_LABELS).sort()).toEqual([...CARE_STAGES].sort());
    expect(CARE_STAGE_LABELS.NOT_STARTED).toBe("ยังไม่เริ่ม");
  });
});

describe("deriveCareSignals", () => {
  const active: CareStage = "IN_ROUND";
  const recent = new Date(now.getTime() - DAY_MS);
  const upcoming = new Date(now.getTime() + DAY_MS);

  it("raises no signal for a recently active patient with an upcoming appointment", () => {
    const signals = deriveCareSignals({ stage: active, now, lastActivityAt: recent, nextAppointmentAt: upcoming, hasOverdueAppointment: false });
    expect(signals).toEqual({ overdueAppointment: false, noUpcomingAppointment: false, stale: false });
    expect(hasAnyCareSignal(signals)).toBe(false);
  });

  it("flags an overdue SCHEDULED appointment", () => {
    const signals = deriveCareSignals({ stage: active, now, lastActivityAt: recent, nextAppointmentAt: upcoming, hasOverdueAppointment: true });
    expect(signals.overdueAppointment).toBe(true);
    expect(hasAnyCareSignal(signals)).toBe(true);
  });

  it("flags a missing next appointment in an active stage", () => {
    expect(deriveCareSignals({ stage: active, now, lastActivityAt: recent, nextAppointmentAt: null, hasOverdueAppointment: false }).noUpcomingAppointment).toBe(true);
  });

  it("is not stale at exactly 30 days and stale just after", () => {
    const boundary = new Date(now.getTime() - CARE_STALE_DAYS * DAY_MS);
    expect(deriveCareSignals({ stage: active, now, lastActivityAt: boundary, nextAppointmentAt: upcoming, hasOverdueAppointment: false }).stale).toBe(false);
    expect(deriveCareSignals({ stage: active, now, lastActivityAt: new Date(boundary.getTime() - 1), nextAppointmentAt: upcoming, hasOverdueAppointment: false }).stale).toBe(true);
  });

  it("treats an active stage without any recorded activity as stale", () => {
    expect(deriveCareSignals({ stage: "READY_FOR_PROGRAM", now, lastActivityAt: null, nextAppointmentAt: upcoming, hasOverdueAppointment: false }).stale).toBe(true);
  });

  it.each<CareStage>(["NOT_STARTED", "PROGRAM_COMPLETED", "CARE_ENDED"])("raises only the overdue signal in the inactive stage %s", (stage) => {
    expect(ACTIVE_CARE_STAGES.has(stage)).toBe(false);
    expect(deriveCareSignals({ stage, now, lastActivityAt: null, nextAppointmentAt: null, hasOverdueAppointment: true }))
      .toEqual({ overdueAppointment: true, noUpcomingAppointment: false, stale: false });
  });

  it.each<CareStage>(["READY_FOR_PROGRAM", "IN_ROUND", "IN_EXTRA_ROUND", "AWAITING_AFTER", "AWAITING_PROGRAM_END"])("applies every signal in the active stage %s", (stage) => {
    expect(deriveCareSignals({ stage, now, lastActivityAt: null, nextAppointmentAt: null, hasOverdueAppointment: true }))
      .toEqual({ overdueAppointment: true, noUpcomingAppointment: true, stale: true });
  });
});
