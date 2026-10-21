import { describe, expect, it } from "vitest";

import { calculateBodyMassIndex } from "./body-mass-index";
import {
  FIRST_FOLLOWUP_ROUND,
  isFollowupRound,
  isProgramRoundNumber,
  isRoundVitalsRound,
  PROGRAM_ROUND_NUMBERS,
  roundActivitySourceFor,
  roundTitle,
  toFollowupRoundNumber,
  toProgramRoundNumber,
} from "./round-catalog";
import {
  computeRoundStatus,
  isPerRoundToolInRound,
  isRoundOpenForWrites,
  nextRoundStep,
  ROUND_STEPS,
  type ProgramRoundFacts,
} from "./round-steps";

function facts(overrides: Partial<ProgramRoundFacts> = {}): ProgramRoundFacts {
  return {
    programActive: true,
    preferredName: null,
    screening: null,
    roundVitals: {},
    followups: {},
    tools: { CONFIDENCE_RULER: {}, ROUTINE: {}, FLOATING_CHART: {}, DREAM_CARD: {} },
    firstGoalPlan: null,
    healthPathReviewed: null,
    completions: {},
    skips: {},
    ...overrides,
  };
}

const evidence = { at: new Date("2026-10-01T00:00:00.000Z"), byDisplayName: null };
const completed = { completedAt: evidence.at, completedByDisplayName: null };

describe("round numbering (WB-DF-01, SR-D13)", () => {
  it("defines six rounds and vitals storage only for rounds 1-2", () => {
    expect(PROGRAM_ROUND_NUMBERS).toEqual([1, 2, 3, 4, 5, 6]);
    expect([1, 2, 3, 4, 5, 6].filter(isRoundVitalsRound)).toEqual([1, 2]);
    expect(isProgramRoundNumber(0)).toBe(false);
    expect(isProgramRoundNumber(7)).toBe(false);
    expect(isProgramRoundNumber("1")).toBe(false);
  });

  it("maps rounds 3-6 to the Follow-up service numbering 1-4 and back", () => {
    expect(FIRST_FOLLOWUP_ROUND).toBe(3);
    expect([1, 2, 3, 4, 5, 6].filter(isFollowupRound)).toEqual([3, 4, 5, 6]);
    expect([3, 4, 5, 6].map(toFollowupRoundNumber)).toEqual([1, 2, 3, 4]);
    expect([1, 2, 3, 4].map(toProgramRoundNumber)).toEqual([3, 4, 5, 6]);
  });

  it("uses the customer workbook titles", () => {
    expect(PROGRAM_ROUND_NUMBERS.map(roundTitle)).toEqual([
      "ครั้งที่ 1 · รู้จักตัวเอง",
      "ครั้งที่ 2 · ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้",
      "ครั้งที่ 3 · ติดตามการฝึกซ้อมพฤติกรรม",
      "ครั้งที่ 4 · ติดตามการฝึกซ้อมพฤติกรรม",
      "ครั้งที่ 5 · ติดตามการฝึกซ้อมพฤติกรรม",
      "ครั้งที่ 6 · ติดตามการฝึกซ้อมพฤติกรรม",
    ]);
  });
});

describe("required step catalog (Canva ผลการจัดบริการ, 2026-10-21)", () => {
  it("lists the checklist steps of each round in order", () => {
    const codes = (round: 1 | 2 | 3 | 4 | 5 | 6) => ROUND_STEPS[round].map((step) => step.code);

    expect(codes(1)).toEqual(["VITALS", "KNOW_SELF", "PAM", "PROMS", "FLOATING_CHART", "CONFIDENCE_RULER", "ROUTINE", "HEALTH_PATH"]);
    expect(codes(2)).toEqual(["VITALS", "HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "ROUTINE"]);
    expect(codes(3)).toEqual(["VITALS", "HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "DREAM_CARD"]);
    expect(codes(4)).toEqual(["VITALS", "HEALTH_PLAN_REVIEW", "FLOATING_CHART", "CONFIDENCE_RULER", "ROUTINE", "HEALTHY_PLAN"]);
    expect(codes(5)).toEqual(["VITALS", "HEALTH_PLAN_REVIEW", "ROUTINE"]);
    expect(codes(6)).toEqual(["VITALS", "HEALTH_PATH_REVIEW", "HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER"]);
  });

  it("counts the checklist items 14/10/10/12/9/10 with items 1-7 in the vitals step", () => {
    const totals = PROGRAM_ROUND_NUMBERS.map((round) =>
      ROUND_STEPS[round].reduce((total, step) => total + step.items.length, 0),
    );

    expect(totals).toEqual([14, 10, 10, 12, 9, 10]);
    expect(ROUND_STEPS[1][0]?.items).toEqual(["ชื่อ-สกุล", "อาชีพ", "น้ำหนัก", "ส่วนสูง", "รอบเอว", "ค่าน้ำตาล", "ความดัน"]);
    expect(PROGRAM_ROUND_NUMBERS.every((round) => ROUND_STEPS[round].every((step) => step.skippable))).toBe(true);
  });

  it("matches the per-round tool rounds enforced by the database (SR-D8/D11)", () => {
    const rounds = (tool: "CONFIDENCE_RULER" | "ROUTINE" | "FLOATING_CHART" | "DREAM_CARD") =>
      PROGRAM_ROUND_NUMBERS.filter((round) => isPerRoundToolInRound(round, tool));

    expect(rounds("CONFIDENCE_RULER")).toEqual([1, 2, 3, 4, 6]);
    expect(rounds("ROUTINE")).toEqual([1, 2, 4, 5]);
    expect(rounds("FLOATING_CHART")).toEqual([1, 4]);
    expect(rounds("DREAM_CARD")).toEqual([3]);
  });

  it("classifies ledger tools outside a round's checklist as EXTRA on the server", () => {
    expect(roundActivitySourceFor(1, "PAM")).toBe("PLANNED");
    expect(roundActivitySourceFor(5, "PAM")).toBe("EXTRA");
    expect(roundActivitySourceFor(6, "HEALTH_PATH")).toBe("PLANNED");
    expect(roundActivitySourceFor(3, "DREAM_CARD")).toBe("PLANNED");
    expect(roundActivitySourceFor(1, "DREAM_CARD")).toBe("EXTRA");
  });
});

describe("round status (SR-D1, SR-D5)", () => {
  it("opens round n only after round n-1 is completed and never reopens a completed round", () => {
    expect(isRoundOpenForWrites(new Set(), 1)).toBe(true);
    expect(isRoundOpenForWrites(new Set(), 2)).toBe(false);
    expect(isRoundOpenForWrites(new Set([1]), 2)).toBe(true);
    expect(isRoundOpenForWrites(new Set([1]), 1)).toBe(false);
  });

  it("is IN_PROGRESS with one item and completable only when every step is resolved", () => {
    const one = computeRoundStatus(facts({ tools: { CONFIDENCE_RULER: { 5: evidence }, ROUTINE: { 5: evidence }, FLOATING_CHART: {}, DREAM_CARD: {} } }), 1);
    expect(one).toMatchObject({ state: "NOT_STARTED", resolvedItems: 0 });

    const started = computeRoundStatus(facts({ tools: { CONFIDENCE_RULER: { 1: evidence }, ROUTINE: {}, FLOATING_CHART: {}, DREAM_CARD: {} } }), 1);
    expect(started).toMatchObject({ state: "IN_PROGRESS", resolvedItems: 1, totalItems: 14, canComplete: false });

    const skips = ROUND_STEPS[5].map((step) => ({ stepCode: step.code, reasonCode: "PATIENT_DECLINED" as const, note: null, at: evidence.at, byDisplayName: null }));
    const allSkipped = computeRoundStatus(facts({ completions: { 1: completed, 2: completed, 3: completed, 4: completed }, skips: { 5: skips } }), 5);
    expect(allSkipped).toMatchObject({ state: "IN_PROGRESS", resolvedItems: 9, canComplete: true });

    expect(computeRoundStatus(facts({ programActive: false, skips: { 1: [] } }), 1).writable).toBe(false);
  });

  it("locks later rounds and shows completion with its date", () => {
    const status = computeRoundStatus(facts({ completions: { 1: completed } }), 1);
    expect(status).toMatchObject({ state: "COMPLETED", writable: false, canComplete: false, completion: completed });
    expect(computeRoundStatus(facts(), 3)).toMatchObject({ state: "LOCKED", writable: false });
  });
});

describe("stepper navigation (SR-D7)", () => {
  it("goes to the next unresolved step after the saved one, then earlier ones, then the summary", () => {
    const steps = computeRoundStatus(facts({ roundVitals: { 1: evidence } }), 1).steps;

    expect(nextRoundStep(steps, null)).toBe("KNOW_SELF");
    expect(nextRoundStep(steps, "VITALS")).toBe("KNOW_SELF");
    expect(nextRoundStep(steps, "ROUTINE")).toBe("KNOW_SELF");
    expect(nextRoundStep(steps, "PAM")).toBe("PROMS");

    const done = computeRoundStatus(
      facts({
        completions: { 1: completed, 2: completed, 3: completed, 4: completed },
        followups: { 5: { ...evidence, goalPlanLinked: true, planAdjusted: false, adjustedPlan: null } },
        tools: { CONFIDENCE_RULER: {}, ROUTINE: { 5: evidence }, FLOATING_CHART: {}, DREAM_CARD: {} },
      }),
      5,
    ).steps;
    expect(nextRoundStep(done, "ROUTINE")).toBe("SUMMARY");
  });
});

describe("calculateBodyMassIndex (WB-DF-04)", () => {
  it("returns kg/m^2 rounded to one decimal", () => {
    expect(calculateBodyMassIndex(74.5, 162)).toBe(28.4);
    expect(calculateBodyMassIndex(69, 162)).toBe(26.3);
    expect(calculateBodyMassIndex(70, 175)).toBe(22.9);
  });

  it("returns null unless both inputs are positive finite numbers", () => {
    expect(calculateBodyMassIndex(null, 160)).toBeNull();
    expect(calculateBodyMassIndex(60, null)).toBeNull();
    expect(calculateBodyMassIndex(undefined, undefined)).toBeNull();
    expect(calculateBodyMassIndex(0, 160)).toBeNull();
    expect(calculateBodyMassIndex(60, 0)).toBeNull();
    expect(calculateBodyMassIndex(-60, 160)).toBeNull();
    expect(calculateBodyMassIndex(Number.NaN, 160)).toBeNull();
    expect(calculateBodyMassIndex(60, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
