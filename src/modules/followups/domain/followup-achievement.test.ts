import { describe, expect, it } from "vitest";

import { computeFollowupAchievement } from "./followup-achievement";

const targets = [
  { activityCode: "stop_sweet", targetDays: 4 },
  { activityCode: "exercise_walk", targetDays: 3 },
];

describe("computeFollowupAchievement", () => {
  it("divides summed achieved days by summed target days", () => {
    expect(
      computeFollowupAchievement(
        [
          { goalActivityCode: "stop_sweet", status: "DONE", achievedDays: 4 },
          { goalActivityCode: "exercise_walk", status: "PARTIAL", achievedDays: 1 },
        ],
        targets,
      ),
    ).toEqual({ achievedDays: 5, targetDays: 7, ratePercent: 71, aboveThreshold: true });
  });

  it("excludes NOT_APPLICABLE activities from both sums", () => {
    expect(
      computeFollowupAchievement(
        [
          { goalActivityCode: "stop_sweet", status: "NOT_APPLICABLE", achievedDays: null },
          { goalActivityCode: "exercise_walk", status: "DONE", achievedDays: 3 },
        ],
        targets,
      ),
    ).toEqual({ achievedDays: 3, targetDays: 3, ratePercent: 100, aboveThreshold: true });
  });

  it("does not count exactly 70% as above the threshold", () => {
    const result = computeFollowupAchievement(
      [{ goalActivityCode: "a", status: "PARTIAL", achievedDays: 7 }],
      [{ activityCode: "a", targetDays: 10 }],
    );
    expect(result).toMatchObject({ ratePercent: 70, aboveThreshold: false });
  });

  it("does not round a rate just over 70% down into the threshold", () => {
    const result = computeFollowupAchievement(
      [{ goalActivityCode: "a", status: "PARTIAL", achievedDays: 141 }],
      [{ activityCode: "a", targetDays: 200 }],
    );
    expect(result).toMatchObject({ ratePercent: 71, aboveThreshold: true });
  });

  it("returns null for legacy rows without achieved days", () => {
    expect(
      computeFollowupAchievement(
        [{ goalActivityCode: "stop_sweet", status: "DONE", achievedDays: null }],
        targets,
      ),
    ).toBeNull();
  });

  it("returns null when an activity is outside the Goal Plan targets", () => {
    expect(
      computeFollowupAchievement([{ goalActivityCode: "unknown", status: "DONE", achievedDays: 2 }], targets),
    ).toBeNull();
  });

  it("returns null when nothing is eligible or targets are zero", () => {
    expect(computeFollowupAchievement([], targets)).toBeNull();
    expect(
      computeFollowupAchievement(
        [{ goalActivityCode: "a", status: "NOT_DONE", achievedDays: 0 }],
        [{ activityCode: "a", targetDays: 0 }],
      ),
    ).toBeNull();
  });
});
