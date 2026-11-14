import { describe, expect, it } from "vitest";

import { followupProgressCoverage, isFollowupProgressComplete } from "./followup-progress-coverage";

const plan = ["stop_sweet", "cardio"];

describe("followupProgressCoverage", () => {
  it("is complete when every plan activity is reported exactly once", () => {
    const coverage = followupProgressCoverage(plan, [{ goalActivityCode: "cardio" }, { goalActivityCode: "stop_sweet" }]);

    expect(coverage).toEqual({ missingActivityCodes: [], unknownActivityCodes: [], duplicateActivityCodes: [] });
    expect(isFollowupProgressComplete(coverage)).toBe(true);
  });

  it("names missing, unknown and duplicate activities", () => {
    const coverage = followupProgressCoverage(plan, [
      { goalActivityCode: "stop_sweet" },
      { goalActivityCode: "stop_sweet" },
      { goalActivityCode: "swim" },
    ]);

    expect(coverage).toEqual({
      missingActivityCodes: ["cardio"],
      unknownActivityCodes: ["swim"],
      duplicateActivityCodes: ["stop_sweet"],
    });
    expect(isFollowupProgressComplete(coverage)).toBe(false);
  });

  it("is incomplete with no progress at all", () => {
    expect(isFollowupProgressComplete(followupProgressCoverage(plan, []))).toBe(false);
  });
});
