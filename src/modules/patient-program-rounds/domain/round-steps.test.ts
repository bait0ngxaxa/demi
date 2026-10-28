import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { calculateBodyMassIndex } from "./body-mass-index";
import {
  FIRST_FOLLOWUP_ROUND,
  GUIDELINE_ROUND_COUNT,
  GUIDELINE_ROUND_NUMBERS,
  isFollowupRound,
  isRoundVitalsRound,
  isValidRoundNumber,
  MAX_PROGRAM_ROUNDS,
  roundActivitySourceFor,
  roundTitle,
  toFollowupRoundNumber,
  toProgramRoundNumber,
} from "./round-catalog";
import {
  computeRoundStatus as computeRoundStatusOverPlan,
  isPerRoundToolInGuideline,
  isRoundOpenForWrites,
  nextRoundStep,
  ROUND_GUIDELINES,
  ROUND_ITEM_CATALOG,
  ROUND_SKIP_REASON_LABELS,
  roundGuideline,
  roundPlan,
  VITALS_MEASUREMENTS,
  type ProgramRoundFacts,
  type RoundFollowupFact,
  type RoundPlanItemFact,
  type RoundStepCode,
} from "./round-steps";

/** The opened guideline plan of a round, as the round service materializes it (ADR-0022). */
function guidelinePlan(roundNumber: number): RoundPlanItemFact[] {
  return roundGuideline(roundNumber).map((definition, index) => ({
    id: `item-${roundNumber}-${definition.code}`,
    stepCode: definition.code,
    customTitle: null,
    position: index + 1,
    removed: false,
    done: null,
  }));
}

const openedGuidelineRounds = Object.fromEntries(
  GUIDELINE_ROUND_NUMBERS.map((roundNumber) => [roundNumber, { planItems: guidelinePlan(roundNumber) }]),
);

/** Status over the round's own plan, as every view and the completion guard compute it. */
function computeRoundStatus(facts: ProgramRoundFacts, roundNumber: number) {
  return computeRoundStatusOverPlan(facts, roundNumber, roundPlan(facts, roundNumber));
}

function facts(overrides: Partial<ProgramRoundFacts> = {}): ProgramRoundFacts {
  return {
    programActive: true,
    preferredName: null,
    screenings: { PAM: null, PROMS: null },
    roundVitals: {},
    followups: {},
    tools: { CONFIDENCE_RULER: {}, ROUTINE: {}, FLOATING_CHART: {}, DREAM_CARD: {} },
    firstGoalPlan: null,
    healthPathReviewed: null,
    completions: {},
    skips: {},
    rounds: openedGuidelineRounds,
    ...overrides,
  };
}

const evidence = { at: new Date("2026-10-01T00:00:00.000Z"), byDisplayName: null };
const recorded = { ...evidence, recordedAt: evidence.at };
const completed = { completedAt: evidence.at, completedByDisplayName: null };
const allVitals = { ...recorded, measurements: VITALS_MEASUREMENTS };
const followupVitals = VITALS_MEASUREMENTS.filter((measurement) => measurement !== "heightCm");
const followup = (measurements: readonly (typeof VITALS_MEASUREMENTS)[number][]): RoundFollowupFact => ({
  ...recorded,
  measurements,
  goalPlanLinked: true,
  planAdjusted: false,
  // A Follow-up recorded before R2: the plan review keeps the D5 rule.
  followedPlan: null,
  reflectionAnswered: false,
  adjustedPlan: null,
});
const vitalsStep = (status: ReturnType<typeof computeRoundStatus>) => status.steps.find((step) => step.code === "VITALS");

describe("round numbering (WB-DF-01, SR-D13, ADR-0022)", () => {
  it("defines six guideline rounds and vitals storage only for rounds 1-2", () => {
    expect(GUIDELINE_ROUND_NUMBERS).toEqual([1, 2, 3, 4, 5, 6]);
    expect(GUIDELINE_ROUND_COUNT).toBe(6);
    expect([1, 2, 3, 4, 5, 6].filter(isRoundVitalsRound)).toEqual([1, 2]);
  });

  it("accepts integer round numbers 1-12 only (FR-D3)", () => {
    expect(MAX_PROGRAM_ROUNDS).toBe(12);
    expect([0, 1, 12, 13, 1.5].map(isValidRoundNumber)).toEqual([false, true, true, false, false]);
    expect(isValidRoundNumber(-1)).toBe(false);
    expect(isValidRoundNumber("1")).toBe(false);
    expect(isValidRoundNumber(Number.NaN)).toBe(false);
  });

  it("maps rounds 3-6 to the Follow-up service numbering 1-4 and back", () => {
    expect(FIRST_FOLLOWUP_ROUND).toBe(3);
    expect([1, 2, 3, 4, 5, 6].filter(isFollowupRound)).toEqual([3, 4, 5, 6]);
    expect([3, 4, 5, 6].map(toFollowupRoundNumber)).toEqual([1, 2, 3, 4]);
    expect([1, 2, 3, 4].map(toProgramRoundNumber)).toEqual([3, 4, 5, 6]);
  });

  it("titles rounds after the guideline as additional service", () => {
    expect(roundTitle(7)).toBe("ครั้งที่ 7 · บริการเพิ่มเติม");
    expect(roundTitle(12)).toBe("ครั้งที่ 12 · บริการเพิ่มเติม");
  });

  it("uses the customer workbook titles", () => {
    expect(GUIDELINE_ROUND_NUMBERS.map(roundTitle)).toEqual([
      "ครั้งที่ 1 · รู้จักตัวเอง",
      "ครั้งที่ 2 · ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้",
      "ครั้งที่ 3 · ติดตามการฝึกซ้อมพฤติกรรม",
      "ครั้งที่ 4 · ติดตามการฝึกซ้อมพฤติกรรม",
      "ครั้งที่ 5 · ติดตามการฝึกซ้อมพฤติกรรม",
      "ครั้งที่ 6 · ติดตามการฝึกซ้อมพฤติกรรม",
    ]);
  });
});

describe("round guideline (Canva ผลการจัดบริการ, 2026-10-21)", () => {
  it("lists the checklist steps of each round in order", () => {
    const codes = (round: number) => roundGuideline(round).map((step) => step.code);

    expect(codes(1)).toEqual(["VITALS", "KNOW_SELF", "PAM", "PROMS", "FLOATING_CHART", "CONFIDENCE_RULER", "ROUTINE", "HEALTH_PATH"]);
    expect(codes(2)).toEqual(["VITALS", "HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "ROUTINE"]);
    expect(codes(3)).toEqual(["VITALS", "HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "DREAM_CARD"]);
    expect(codes(4)).toEqual(["VITALS", "HEALTH_PLAN_REVIEW", "FLOATING_CHART", "CONFIDENCE_RULER", "ROUTINE", "HEALTHY_PLAN"]);
    expect(codes(5)).toEqual(["VITALS", "HEALTH_PLAN_REVIEW", "ROUTINE"]);
    expect(codes(6)).toEqual(["VITALS", "HEALTH_PATH_REVIEW", "HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER"]);
    expect(codes(7)).toEqual([]);
    expect(Object.keys(ROUND_GUIDELINES).map(Number)).toEqual(GUIDELINE_ROUND_NUMBERS);
  });

  it("counts the checklist items 14/10/10/12/9/10 with items 1-7 in the vitals step", () => {
    const totals = GUIDELINE_ROUND_NUMBERS.map((round) =>
      roundGuideline(round).reduce((total, step) => total + step.items.length, 0),
    );

    expect(totals).toEqual([14, 10, 10, 12, 9, 10]);
    expect(roundGuideline(1)[0]?.items).toEqual(["ชื่อ-สกุล", "อาชีพ", "น้ำหนัก", "ส่วนสูง", "รอบเอว", "ค่าน้ำตาล", "ความดัน"]);
    expect(GUIDELINE_ROUND_NUMBERS.every((round) => roundGuideline(round).every((step) => step.skippable))).toBe(true);
  });

  it("seeds the per-round tools in the guideline rounds (SR-D8/D11)", () => {
    const rounds = (tool: "CONFIDENCE_RULER" | "ROUTINE" | "FLOATING_CHART" | "DREAM_CARD") =>
      GUIDELINE_ROUND_NUMBERS.filter((round) => isPerRoundToolInGuideline(round, tool));

    expect(rounds("CONFIDENCE_RULER")).toEqual([1, 2, 3, 4, 6]);
    expect(rounds("ROUTINE")).toEqual([1, 2, 4, 5]);
    expect(rounds("FLOATING_CHART")).toEqual([1, 4]);
    expect(rounds("DREAM_CARD")).toEqual([3]);
  });

  it("classifies ledger tools by the round's active plan on the server (FR-1b)", () => {
    const planOf = (roundNumber: number) => roundGuideline(roundNumber).map((step) => step.code);

    expect(roundActivitySourceFor(1, "PAM", planOf(1))).toBe("PLANNED");
    expect(roundActivitySourceFor(5, "PAM", planOf(5))).toBe("EXTRA");
    expect(roundActivitySourceFor(6, "HEALTH_PATH", planOf(6))).toBe("PLANNED");
    expect(roundActivitySourceFor(3, "DREAM_CARD", planOf(3))).toBe("PLANNED");
    expect(roundActivitySourceFor(1, "DREAM_CARD", planOf(1))).toBe("EXTRA");
    // A step added to a plan is PLANNED, also after the guideline rounds; a tool not in the plan is EXTRA.
    expect(roundActivitySourceFor(5, "PAM", [...planOf(5), "PAM"])).toBe("PLANNED");
    expect(roundActivitySourceFor(7, "CONFIDENCE_RULER", ["CONFIDENCE_RULER"])).toBe("PLANNED");
    expect(roundActivitySourceFor(7, "ROUTINE", [])).toBe("EXTRA");
    // The health path is reviewed as HEALTH_PATH_REVIEW in round 6 only.
    expect(roundActivitySourceFor(6, "HEALTH_PATH", ["HEALTH_PATH"])).toBe("EXTRA");
  });
});

describe("round status (SR-D1, SR-D5)", () => {
  it("opens round n only after round n-1 is completed and never reopens a completed round", () => {
    expect(isRoundOpenForWrites(new Set(), 1)).toBe(true);
    expect(isRoundOpenForWrites(new Set(), 2)).toBe(false);
    expect(isRoundOpenForWrites(new Set([1]), 2)).toBe(true);
    expect(isRoundOpenForWrites(new Set([1]), 1)).toBe(false);
  });

  it("allows completion with one DONE item, but never with only skipped items", () => {
    const one = computeRoundStatus(facts({ tools: { CONFIDENCE_RULER: { 5: evidence }, ROUTINE: { 5: evidence }, FLOATING_CHART: {}, DREAM_CARD: {} } }), 1);
    expect(one).toMatchObject({ state: "NOT_STARTED", resolvedItems: 0 });

    const started = computeRoundStatus(facts({ tools: { CONFIDENCE_RULER: { 1: evidence }, ROUTINE: {}, FLOATING_CHART: {}, DREAM_CARD: {} } }), 1);
    expect(started).toMatchObject({ state: "IN_PROGRESS", resolvedItems: 1, totalItems: 14, canComplete: true });

    const skips = roundGuideline(5).map((step) => ({ planItemId: `item-5-${step.code}`, stepCode: step.code, reasonCode: "PATIENT_DECLINED" as const, note: null, at: evidence.at, byDisplayName: null }));
    const allSkipped = computeRoundStatus(facts({ completions: { 1: completed, 2: completed, 3: completed, 4: completed }, skips: { 5: skips } }), 5);
    expect(allSkipped).toMatchObject({ state: "IN_PROGRESS", resolvedItems: 9, canComplete: false });

    expect(computeRoundStatus(facts({ programActive: false, skips: { 1: [] } }), 1).writable).toBe(false);
  });

  it("locks later rounds and shows completion with its date", () => {
    const status = computeRoundStatus(facts({ completions: { 1: completed } }), 1);
    expect(status).toMatchObject({ state: "COMPLETED", writable: false, canComplete: false, completion: completed });
    expect(computeRoundStatus(facts(), 3)).toMatchObject({ state: "LOCKED", writable: false });
  });
});

describe("vitals step: items 1-7 need every measurement", () => {
  it("stays TODO with the missing list when one value is recorded", () => {
    const status = computeRoundStatus(facts({ roundVitals: { 1: { ...recorded, measurements: ["weight"] } } }), 1);

    expect(vitalsStep(status)).toMatchObject({
      status: "TODO",
      evidence: null,
      missingMeasurements: ["heightCm", "waistCircumference", "bloodSugar", "systolicBloodPressure", "diastolicBloodPressure"],
    });
    // The health path starting point still derives from whatever round 1 recorded (SR-D9).
    expect(status.steps.find((step) => step.code === "HEALTH_PATH")?.status).toBe("DONE");
  });

  it("is DONE with every measurement, including height in rounds 1-2", () => {
    expect(vitalsStep(computeRoundStatus(facts({ roundVitals: { 1: allVitals } }), 1))).toMatchObject({
      status: "DONE",
      missingMeasurements: [],
    });

    const withoutHeight = { ...recorded, measurements: followupVitals };
    expect(
      vitalsStep(computeRoundStatus(facts({ completions: { 1: completed }, roundVitals: { 2: withoutHeight } }), 2)),
    ).toMatchObject({ status: "TODO", missingMeasurements: ["heightCm"] });
  });

  it("uses the latest height in rounds 3-6, and a Follow-up without vitals leaves the plan review DONE", () => {
    const opened = { 1: completed, 2: completed, 3: completed };
    const full = computeRoundStatus(facts({ completions: opened, followups: { 4: followup(followupVitals) } }), 4);
    expect(vitalsStep(full)).toMatchObject({ status: "DONE", missingMeasurements: [] });

    const bare = computeRoundStatus(facts({ completions: opened, followups: { 4: followup([]) } }), 4);
    expect(vitalsStep(bare)).toMatchObject({ status: "TODO", missingMeasurements: followupVitals });
    expect(bare.steps.find((step) => step.code === "HEALTH_PLAN_REVIEW")?.status).toBe("DONE");
  });

  it("allows completion without vitals when the plan review is DONE", () => {
    const resolvedOthers = roundGuideline(5)
      .filter((step) => step.code !== "VITALS")
      .map((step) => ({ planItemId: `item-5-${step.code}`, stepCode: step.code, reasonCode: "PATIENT_DECLINED" as const, note: null, at: evidence.at, byDisplayName: null }));
    const opened = { 1: completed, 2: completed, 3: completed, 4: completed };
    const partial = { followups: { 5: followup(["weight"]) }, completions: opened };

    expect(computeRoundStatus(facts({ ...partial, skips: { 5: resolvedOthers } }), 5).canComplete).toBe(true);

    const skipVitals = { planItemId: "item-5-VITALS", stepCode: "VITALS" as const, reasonCode: "EQUIPMENT_UNAVAILABLE" as const, note: null, at: evidence.at, byDisplayName: null };
    const skipped = computeRoundStatus(facts({ ...partial, skips: { 5: [...resolvedOthers, skipVitals] } }), 5);
    expect(vitalsStep(skipped)?.status).toBe("SKIPPED");
    expect(skipped.canComplete).toBe(true);

    const full = computeRoundStatus(facts({ followups: { 5: followup(followupVitals) }, completions: opened, skips: { 5: resolvedOthers } }), 5);
    expect(full.canComplete).toBe(true);
  });
});

describe("PAM and PROMs are independent steps (R2-C)", () => {
  const stepStatus = (status: ReturnType<typeof computeRoundStatus>, code: string) =>
    status.steps.find((step) => step.code === code)?.status;

  it("records PAM without PROMs and skips PROMs on its own", () => {
    const pamOnly = computeRoundStatus(facts({ screenings: { PAM: evidence, PROMS: null } }), 1);
    expect(stepStatus(pamOnly, "PAM")).toBe("DONE");
    expect(stepStatus(pamOnly, "PROMS")).toBe("TODO");

    const promsSkipped = computeRoundStatus(
      facts({
        screenings: { PAM: evidence, PROMS: null },
        skips: { 1: [{ planItemId: "item-1-PROMS", stepCode: "PROMS", reasonCode: "PATIENT_DECLINED", note: null, at: evidence.at, byDisplayName: null }] },
      }),
      1,
    );
    expect(stepStatus(promsSkipped, "PAM")).toBe("DONE");
    expect(stepStatus(promsSkipped, "PROMS")).toBe("SKIPPED");

    const promsOnly = computeRoundStatus(facts({ screenings: { PAM: null, PROMS: evidence } }), 1);
    expect(stepStatus(promsOnly, "PAM")).toBe("TODO");
    expect(stepStatus(promsOnly, "PROMS")).toBe("DONE");
  });
});

describe("ทบทวนแผนสุขภาพ rounds 3-6 (R2-F)", () => {
  const opened = { 1: completed, 2: completed };
  const reviewStatus = (fact: RoundFollowupFact) =>
    computeRoundStatus(facts({ completions: opened, followups: { 3: fact } }), 3).steps.find(
      (step) => step.code === "HEALTH_PLAN_REVIEW",
    )?.status;
  const r2 = { ...followup(followupVitals), planAdjusted: null };

  it("is DONE with a linked plan, ทำตามแผนได้/ไม่ได้ answered and เกิดอะไรขึ้นบ้าง not blank", () => {
    expect(reviewStatus({ ...r2, followedPlan: true, reflectionAnswered: true })).toBe("DONE");
    expect(reviewStatus({ ...r2, followedPlan: false, reflectionAnswered: true })).toBe("DONE");
  });

  it("stays TODO without เกิดอะไรขึ้นบ้าง or without a linked plan, whatever planAdjusted says", () => {
    expect(reviewStatus({ ...r2, followedPlan: true, reflectionAnswered: false, planAdjusted: false })).toBe("TODO");
    expect(reviewStatus({ ...r2, followedPlan: true, reflectionAnswered: true, goalPlanLinked: false })).toBe("TODO");
  });

  it("keeps the D5 rule for Follow-ups recorded before R2 (no followedPlan)", () => {
    expect(reviewStatus(followup(followupVitals))).toBe("DONE");
    expect(reviewStatus({ ...followup(followupVitals), planAdjusted: null })).toBe("TODO");
  });

  it("still answers round 4's แผนสุขภาพดีของฉัน from planAdjusted", () => {
    const status = computeRoundStatus(
      facts({
        completions: { ...opened, 3: completed },
        followups: { 4: { ...r2, planAdjusted: false, followedPlan: true, reflectionAnswered: true } },
      }),
      4,
    );

    expect(status.steps.find((step) => step.code === "HEALTHY_PLAN")?.status).toBe("DONE");
  });
});

describe("stepper navigation (SR-D7)", () => {
  it("goes to the next unresolved step after the saved one, then earlier ones, then the summary", () => {
    const steps = computeRoundStatus(facts({ roundVitals: { 1: allVitals } }), 1).steps;

    expect(nextRoundStep(steps, null)).toBe("KNOW_SELF");
    expect(nextRoundStep(steps, "VITALS")).toBe("KNOW_SELF");
    expect(nextRoundStep(steps, "ROUTINE")).toBe("KNOW_SELF");
    expect(nextRoundStep(steps, "PAM")).toBe("PROMS");

    const done = computeRoundStatus(
      facts({
        completions: { 1: completed, 2: completed, 3: completed, 4: completed },
        followups: { 5: followup(followupVitals) },
        tools: { CONFIDENCE_RULER: {}, ROUTINE: { 5: evidence }, FLOATING_CHART: {}, DREAM_CARD: {} },
      }),
      5,
    ).steps;
    expect(nextRoundStep(done, "ROUTINE")).toBe("SUMMARY");
  });
});

describe("round item catalog (ADR-0022)", () => {
  const codes = Object.keys(ROUND_ITEM_CATALOG) as RoundStepCode[];

  it("describes every step code, CUSTOM included, under its own code", () => {
    expect(codes).toEqual([
      "VITALS", "KNOW_SELF", "PAM", "PROMS", "FLOATING_CHART", "CONFIDENCE_RULER", "ROUTINE",
      "HEALTH_PATH", "HEALTH_PLAN_REVIEW", "DREAM_CARD", "HEALTHY_PLAN", "HEALTH_PATH_REVIEW", "CUSTOM",
    ]);
    expect(codes.every((code) => ROUND_ITEM_CATALOG[code].code === code && ROUND_ITEM_CATALOG[code].label.length > 0)).toBe(true);
    expect(codes.every((code) => ROUND_ITEM_CATALOG[code].skippable)).toBe(true);
  });

  it("keeps the flags consistent", () => {
    const flagged = (flag: "repeatable" | "oncePerProgram" | "staffOnly" | "patientRecordable") =>
      codes.filter((code) => ROUND_ITEM_CATALOG[code][flag]);

    expect(flagged("oncePerProgram")).toEqual(["KNOW_SELF", "PAM", "PROMS", "HEALTH_PATH"]);
    // FR-D4a: what the patient may record in their own open round.
    expect(flagged("patientRecordable")).toEqual([
      "VITALS", "KNOW_SELF", "PAM", "PROMS", "FLOATING_CHART", "CONFIDENCE_RULER", "ROUTINE", "DREAM_CARD", "CUSTOM",
    ]);
    expect(flagged("staffOnly")).toEqual(["HEALTH_PLAN_REVIEW", "HEALTHY_PLAN", "HEALTH_PATH_REVIEW"]);
    expect(codes.filter((code) => ROUND_ITEM_CATALOG[code].oncePerProgram && ROUND_ITEM_CATALOG[code].repeatable)).toEqual([]);
    expect(codes.filter((code) => ROUND_ITEM_CATALOG[code].staffOnly && ROUND_ITEM_CATALOG[code].patientRecordable)).toEqual([]);
  });

  it("builds every guideline step from the catalog, once per round, and never CUSTOM", () => {
    for (const round of GUIDELINE_ROUND_NUMBERS) {
      const steps = roundGuideline(round);

      expect(new Set(steps.map((step) => step.code)).size).toBe(steps.length);
      for (const step of steps) {
        expect(step).toMatchObject({
          label: ROUND_ITEM_CATALOG[step.code].label,
          items: ROUND_ITEM_CATALOG[step.code].items,
        });
        expect(step.code).not.toBe("CUSTOM");
      }
    }

    // Round 2 answers ทบทวนแผนสุขภาพ with the Program's first Goal Plan; other rounds with their Follow-up.
    expect(roundGuideline(2).find((step) => step.code === "HEALTH_PLAN_REVIEW")?.kind).toBe("GOAL_PLAN");
    expect(roundGuideline(3).find((step) => step.code === "HEALTH_PLAN_REVIEW")?.kind).toBe("FOLLOWUP_REVIEW");
  });

  it("labels the system close-out skip reason", () => {
    expect(ROUND_SKIP_REASON_LABELS.NOT_DONE_AT_CLOSE).toBe("ยังไม่ได้ทำเมื่อจบบริการ");
  });

  it("is seeded by the migration exactly as the guideline (anti-drift)", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "prisma/migrations/20261124100000_plan_driven_service_rounds/migration.sql"),
      "utf8",
    );
    const dataStep = migration.slice(
      migration.indexOf("-- BEGIN FR-1 data step"),
      migration.indexOf("-- END FR-1 data step"),
    );
    const seeded = [...dataStep.matchAll(/\((\d+), (\d+), '([A-Z_]+)'\)/gu)].map((match) => [
      Number(match[1]),
      Number(match[2]),
      match[3],
    ]);
    const guideline = GUIDELINE_ROUND_NUMBERS.flatMap((round) =>
      roundGuideline(round).map((step, index) => [round, index + 1, step.code]),
    );

    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded).toEqual(guideline);
  });
});

describe("round status over plans (ADR-0022)", () => {
  const item = (overrides: Partial<RoundPlanItemFact> & Pick<RoundPlanItemFact, "stepCode" | "position">): RoundPlanItemFact => ({
    id: `item-${overrides.stepCode}-${overrides.position}`,
    customTitle: null,
    removed: false,
    done: null,
    ...overrides,
  });
  const custom = (position: number, title: string, done: RoundPlanItemFact["done"] = null) =>
    item({ stepCode: "CUSTOM", position, customTitle: title, done });
  const withPlan = (roundNumber: number, planItems: RoundPlanItemFact[], overrides: Partial<ProgramRoundFacts> = {}) =>
    facts({ ...overrides, rounds: { ...openedGuidelineRounds, [roundNumber]: { planItems } } });

  it("iterates the active plan by position and ignores removed items", () => {
    const plan = [
      item({ stepCode: "ROUTINE", position: 3 }),
      item({ stepCode: "VITALS", position: 1 }),
      item({ stepCode: "CONFIDENCE_RULER", position: 2, removed: true }),
      custom(4, "เดินรอบหมู่บ้าน"),
    ];
    const status = computeRoundStatus(withPlan(1, plan), 1);

    expect(status.steps.map((step) => step.code)).toEqual(["VITALS", "ROUTINE", "CUSTOM"]);
    expect(status.steps.map((step) => step.planItemId)).toEqual([
      "item-VITALS-1",
      "item-ROUTINE-3",
      "item-CUSTOM-4",
    ]);
    expect(status.totalItems).toBe(7 + 1 + 1);
  });

  it("titles a CUSTOM item by its own title and makes it DONE once marked done", () => {
    const todo = computeRoundStatus(withPlan(1, [custom(1, "เดินรอบหมู่บ้าน")]), 1);
    expect(todo.steps[0]).toMatchObject({ code: "CUSTOM", kind: "CUSTOM", label: "เดินรอบหมู่บ้าน", items: ["เดินรอบหมู่บ้าน"], status: "TODO" });
    expect(todo).toMatchObject({ state: "NOT_STARTED", canComplete: false });

    const done = computeRoundStatus(withPlan(1, [custom(1, "เดินรอบหมู่บ้าน", evidence)]), 1);
    expect(done.steps[0]).toMatchObject({ status: "DONE", evidence });
    expect(done).toMatchObject({ state: "IN_PROGRESS", resolvedItems: 1, totalItems: 1, canComplete: true });
  });

  it("matches a skip to its own plan item only (FR-1b)", () => {
    const skipOf = (planItemId: string, stepCode: RoundStepCode) => ({
      planItemId,
      stepCode,
      reasonCode: "PATIENT_DECLINED" as const,
      note: null,
      at: evidence.at,
      byDisplayName: null,
    });
    const customs = [custom(1, "เดินรอบหมู่บ้าน"), custom(2, "ทำสวน")];
    const oneSkipped = computeRoundStatus(withPlan(1, customs, { skips: { 1: [skipOf("item-CUSTOM-1", "CUSTOM")] } }), 1);
    expect(oneSkipped.steps.map((step) => [step.planItemId, step.status])).toEqual([
      ["item-CUSTOM-1", "SKIPPED"],
      ["item-CUSTOM-2", "TODO"],
    ]);

    // The skip of a removed item never applies to the same step added again.
    const readded = [item({ stepCode: "ROUTINE", position: 1, removed: true }), item({ stepCode: "ROUTINE", position: 2 })];
    const afterReadd = computeRoundStatus(withPlan(1, readded, { skips: { 1: [skipOf("item-ROUTINE-1", "ROUTINE")] } }), 1);
    expect(afterReadd.steps.map((step) => [step.planItemId, step.status])).toEqual([["item-ROUTINE-2", "TODO"]]);
  });

  it("never completes an empty plan", () => {
    expect(computeRoundStatus(withPlan(1, []), 1)).toMatchObject({ steps: [], writable: true, canComplete: false });
  });

  it("previews the guideline of a round not opened yet, and rounds after the guideline as empty", () => {
    const unopened = facts({ rounds: { 1: { planItems: guidelinePlan(1) } } });

    expect(roundPlan(unopened, 2).map((planItem) => [planItem.id, planItem.stepCode])).toEqual([
      [null, "VITALS"],
      [null, "HEALTH_PLAN_REVIEW"],
      [null, "CONFIDENCE_RULER"],
      [null, "ROUTINE"],
    ]);
    // Not opened: never writable, even after round 1 is completed.
    expect(computeRoundStatus({ ...unopened, completions: { 1: completed } }, 2)).toMatchObject({ writable: false, canComplete: false });
    expect(roundPlan(unopened, 7)).toEqual([]);
  });

  it("uses the round's own guideline definition, else the catalog entry", () => {
    const opened = { 1: completed, 2: completed, 3: completed, 4: completed, 5: completed, 6: completed };
    const status = computeRoundStatus(
      withPlan(7, [item({ stepCode: "HEALTH_PLAN_REVIEW", position: 1 }), item({ stepCode: "DREAM_CARD", position: 2 })], {
        completions: opened,
        tools: { CONFIDENCE_RULER: {}, ROUTINE: {}, FLOATING_CHART: {}, DREAM_CARD: { 7: evidence } },
      }),
      7,
    );

    expect(status.steps.map((step) => [step.code, step.kind, step.status])).toEqual([
      ["HEALTH_PLAN_REVIEW", "FOLLOWUP_REVIEW", "TODO"],
      ["DREAM_CARD", "PER_ROUND_TOOL", "DONE"],
    ]);
    expect(status.writable).toBe(true);
  });
});

describe("vitals evidence from either source (ADR-0022)", () => {
  const opened = { 1: completed, 2: completed, 3: completed };
  const earlier = new Date("2026-10-01T00:00:00.000Z");
  const later = new Date("2026-10-02T00:00:00.000Z");

  it("is DONE when either the round vitals or the Follow-up holds every required measurement", () => {
    const fromRoundVitals = computeRoundStatus(
      facts({
        completions: opened,
        roundVitals: { 4: { ...recorded, measurements: followupVitals } },
        followups: { 4: followup(["weight"]) },
      }),
      4,
    );
    expect(vitalsStep(fromRoundVitals)).toMatchObject({ status: "DONE", missingMeasurements: [] });

    const fromFollowup = computeRoundStatus(
      facts({ completions: opened, roundVitals: { 4: { ...recorded, measurements: ["weight"] } }, followups: { 4: followup(followupVitals) } }),
      4,
    );
    expect(vitalsStep(fromFollowup)).toMatchObject({ status: "DONE", missingMeasurements: [] });
  });

  it("takes the latest complete source as evidence and reports the latest source's gaps otherwise", () => {
    const both = computeRoundStatus(
      facts({
        completions: opened,
        roundVitals: { 4: { at: later, byDisplayName: "ผู้ป่วย", recordedAt: later, measurements: followupVitals } },
        followups: { 4: { ...followup(followupVitals), at: earlier, byDisplayName: "อสม.", recordedAt: earlier } },
      }),
      4,
    );
    expect(vitalsStep(both)?.evidence).toEqual({ at: later, byDisplayName: "ผู้ป่วย" });

    const partial = computeRoundStatus(
      facts({
        completions: opened,
        roundVitals: { 4: { ...recorded, recordedAt: later, measurements: ["weight", "bloodSugar"] } },
        followups: { 4: { ...followup(["weight"]), recordedAt: earlier } },
      }),
      4,
    );
    expect(vitalsStep(partial)).toMatchObject({
      status: "TODO",
      missingMeasurements: ["waistCircumference", "systolicBloodPressure", "diastolicBloodPressure"],
    });
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
