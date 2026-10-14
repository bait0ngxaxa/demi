import { describe, expect, it } from "vitest";

import { calculateBodyMassIndex } from "./body-mass-index";
import {
  FIRST_FOLLOWUP_ROUND,
  isFollowupRound,
  isProgramRoundNumber,
  isRecommendedTool,
  isReviewableTool,
  isRoundVitalsRound,
  PROGRAM_ROUND_NUMBERS,
  ROUND_RECOMMENDED_TOOLS,
  ROUND_TOOLS,
  roundActivitySourceFor,
  roundToolCodes,
  roundToolLabel,
  toFollowupRoundNumber,
  toProgramRoundNumber,
} from "./round-catalog";

describe("whiteboard round catalog (WB-DF-01..03, WB-PD-01)", () => {
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

  it("recommends exactly the whiteboard boxes of each round", () => {
    expect(ROUND_RECOMMENDED_TOOLS).toEqual({
      1: ["KNOW_SELF", "PAM", "PROMS", "FLOATING_CHART", "CONFIDENCE_RULER", "LIFE_TABLE", "HEALTH_PATH"],
      2: ["HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "LIFE_TABLE"],
      3: ["HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "DREAM_CARD"],
      4: ["HEALTH_PLAN_REVIEW", "FLOATING_CHART", "CONFIDENCE_RULER", "LIFE_TABLE", "HEALTHY_PLAN"],
      5: ["HEALTH_PLAN_REVIEW", "LIFE_TABLE"],
      6: ["HEALTH_PATH", "HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER"],
    });
  });

  it("classifies tools outside a round's whiteboard boxes as EXTRA on the server", () => {
    expect(roundActivitySourceFor(3, "DREAM_CARD")).toBe("PLANNED");
    expect(roundActivitySourceFor(2, "DREAM_CARD")).toBe("EXTRA");
    // ตารางกิจวัตร is not on the whiteboard at all; it is never PLANNED.
    for (const round of PROGRAM_ROUND_NUMBERS) {
      expect(isRecommendedTool(round, "ROUTINE")).toBe(false);
      expect(roundActivitySourceFor(round, "ROUTINE")).toBe("EXTRA");
    }
    // The Goal Plan is created in round 2 but the whiteboard lists แผนสุขภาพดีของฉัน in round 4 only.
    expect(roundActivitySourceFor(2, "HEALTHY_PLAN")).toBe("EXTRA");
    expect(roundActivitySourceFor(4, "HEALTHY_PLAN")).toBe("PLANNED");
    expect(roundActivitySourceFor(1, "DREAM_CARD")).toBe("EXTRA");
  });

  it("labels the round 6 Health Path box as a review", () => {
    expect(roundToolLabel(1, "HEALTH_PATH")).toBe("เส้นทางสุขภาพ");
    expect(roundToolLabel(6, "HEALTH_PATH")).toBe("ทบทวนเส้นทางสุขภาพ");
  });

  it("marks the undefined tools as pending forms and never reviewable", () => {
    for (const code of ["KNOW_SELF", "LIFE_TABLE", "HEALTH_PATH"] as const) {
      expect(ROUND_TOOLS[code].kind).toBe("PENDING_FORM");
      expect(isReviewableTool(code)).toBe(false);
    }
  });

  it("limits review to Service 1 tools and screening (WB-DF-03)", () => {
    expect(roundToolCodes.filter(isReviewableTool).sort()).toEqual(
      ["CONFIDENCE_RULER", "DREAM_CARD", "FLOATING_CHART", "PAM", "PROMS", "ROUTINE"].sort(),
    );
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
