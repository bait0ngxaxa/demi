import { describe, expect, it } from "vitest";

import {
  getLineQuickActionReturnPathFromUrl,
  LINE_QUICK_ACTION_RETURN_PATHS,
} from "./line-navigation-intents";

describe("quick-action login return paths derived from request URLs", () => {
  it.each(LINE_QUICK_ACTION_RETURN_PATHS)("accepts only the canonical quick-action URL %s", (path) => {
    expect(getLineQuickActionReturnPathFromUrl(new URL(path, "https://demi.example.org"))).toBe(path);
  });

  it.each([
    "/app/patients/assigned?task=screening&next=/app",
    "/app/patients/assigned?task=screening&task=followup",
    "/app/patients/assigned?task=screening%252f..%252f..",
    "/app/patients/assigned%2F..%2Fpersonal?task=screening",
    "/app/patients/assigned?task=SCREENING",
  ])("rejects a non-canonical quick-action URL %s", (url) => {
    expect(getLineQuickActionReturnPathFromUrl(new URL(url, "https://demi.example.org"))).toBeNull();
  });
});
