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
  RETIRED_TOOL_CODES,
  ROUND_RECOMMENDED_TOOLS,
  ROUND_TOOLS,
  roundActivitySourceFor,
  roundToolCodes,
  roundToolLabel,
  toFollowupRoundNumber,
  toProgramRoundNumber,
} from "./round-catalog";

describe("whiteboard round catalog (WB-DF-01..03, customer decisions D1-D4)", () => {
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

  it("recommends the whiteboard boxes of each round as resolved by customer decisions D1-D4", () => {
    expect(ROUND_RECOMMENDED_TOOLS).toEqual({
      1: ["PAM", "PROMS", "FLOATING_CHART", "DREAM_CARD", "ROUTINE", "CONFIDENCE_RULER", "HEALTH_PATH"],
      2: ["HEALTHY_PLAN", "CONFIDENCE_RULER", "ROUTINE"],
      3: ["HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER", "DREAM_CARD"],
      4: ["HEALTH_PLAN_REVIEW", "FLOATING_CHART", "CONFIDENCE_RULER", "ROUTINE", "HEALTHY_PLAN"],
      5: ["HEALTH_PLAN_REVIEW", "ROUTINE"],
      6: ["HEALTH_PATH", "HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER"],
    });
  });

  it("never lists the retired KNOW_SELF / LIFE_TABLE tools (D1/D2)", () => {
    expect(RETIRED_TOOL_CODES).toEqual(["KNOW_SELF", "LIFE_TABLE"]);
    for (const round of PROGRAM_ROUND_NUMBERS) {
      for (const code of RETIRED_TOOL_CODES) {
        expect(isRecommendedTool(round, code)).toBe(false);
      }
    }
  });

  it("classifies tools outside a round's boxes as EXTRA on the server", () => {
    // D2/D3: the routine and the dream card are recorded in round 1 and reviewed later.
    expect(roundActivitySourceFor(1, "ROUTINE")).toBe("PLANNED");
    expect(roundActivitySourceFor(1, "DREAM_CARD")).toBe("PLANNED");
    expect([2, 4, 5].map((round) => roundActivitySourceFor(round as 2 | 4 | 5, "ROUTINE"))).toEqual([
      "PLANNED",
      "PLANNED",
      "PLANNED",
    ]);
    expect(roundActivitySourceFor(3, "ROUTINE")).toBe("EXTRA");
    expect(roundActivitySourceFor(3, "DREAM_CARD")).toBe("PLANNED");
    expect(roundActivitySourceFor(2, "DREAM_CARD")).toBe("EXTRA");
    // D4: the Goal Plan is created in round 2 and adjusted in round 4.
    expect(roundActivitySourceFor(2, "HEALTHY_PLAN")).toBe("PLANNED");
    expect(roundActivitySourceFor(4, "HEALTHY_PLAN")).toBe("PLANNED");
    expect(roundActivitySourceFor(2, "HEALTH_PLAN_REVIEW")).toBe("EXTRA");
  });

  it("uses the whiteboard wording per round", () => {
    expect(roundToolLabel(1, "ROUTINE")).toBe("ตารางชีวิตของฉัน (ตารางกิจวัตร)");
    expect(roundToolLabel(4, "ROUTINE")).toBe("ตารางชีวิตของฉัน (ตารางกิจวัตร)");
    expect(roundToolLabel(1, "DREAM_CARD")).toBe("การ์ดความฝัน");
    expect(roundToolLabel(3, "DREAM_CARD")).toBe("ความฝันของฉัน (การ์ดความฝัน)");
    expect(roundToolLabel(2, "HEALTHY_PLAN")).toBe("ทำแผนสุขภาพ");
    expect(roundToolLabel(4, "HEALTHY_PLAN")).toBe("แผนสุขภาพดีของฉัน");
    expect(roundToolLabel(1, "HEALTH_PATH")).toBe("เส้นทางสุขภาพ");
    expect(roundToolLabel(6, "HEALTH_PATH")).toBe("ทบทวนเส้นทางสุขภาพ");
  });

  it("keeps the Health Path as a pending form that is never reviewable", () => {
    expect(ROUND_TOOLS.HEALTH_PATH.kind).toBe("PENDING_FORM");
    expect(isReviewableTool("HEALTH_PATH")).toBe(false);
    for (const code of RETIRED_TOOL_CODES) {
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
