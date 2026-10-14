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
  roundToolCodes,
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

  it("recommends the Service 1 tools and screening in round 1 and the plan in round 2", () => {
    expect(ROUND_RECOMMENDED_TOOLS[1]).toEqual(
      expect.arrayContaining(["PAM", "PROMS", "FLOATING_CHART", "DREAM_CARD", "ROUTINE", "CONFIDENCE_RULER"]),
    );
    expect(ROUND_RECOMMENDED_TOOLS[2]).toEqual(["HEALTHY_PLAN"]);
    for (const round of [3, 4, 5, 6] as const) {
      expect(ROUND_RECOMMENDED_TOOLS[round]).toContain("HEALTH_PLAN_REVIEW");
    }
    expect(isRecommendedTool(3, "DREAM_CARD")).toBe(true);
    expect(isRecommendedTool(2, "DREAM_CARD")).toBe(false);
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
