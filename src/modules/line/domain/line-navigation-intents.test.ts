import { describe, expect, it } from "vitest";

import {
  canonicalizeLineEntryPath,
  getLineQuickActionReturnPathFromUrl,
  LINE_QUICK_ACTION_RETURN_PATHS,
  LINE_WEB_NAVIGATION_PATHS,
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

  describe("across LIFF redirects that add LINE platform parameters", () => {
    const resolve = (url: string): string | null => getLineQuickActionReturnPathFromUrl(new URL(url, "https://demi.example.org"));

    it.each([
      // In-LINE login forced by liff.init() returns with liff.hback, which the secondary redirect keeps.
      ["/app/personal/medications?liff.hback=2", "/app/personal/medications"],
      ["/app/personal/wellness?lineAppVersion=14.19.1", "/app/personal/wellness"],
      ["/app/patients/assigned?task=screening&liff.hback=2", "/app/patients/assigned?task=screening"],
      ["/app/patients/assigned?liff.hback=2&task=screening&lineAppVersion=14.19.1", "/app/patients/assigned?task=screening"],
      ["/app/personal?liff.referrer=https%3A%2F%2Fliff.line.me%2F1234567890-Account", "/app/personal"],
      ["/app/personal/care?liff.futureFlag=1", "/app/personal/care"],
      ["/app/personal/appointments?liff.hback=2&liff.hback=2", "/app/personal/appointments"],
      // LINE Login return markers are bookkeeping only together with liffClientId.
      ["/app/personal/medications?liff.hback=2&code=synthetic&state=synthetic&liffClientId=1234567890&liffRedirectUri=https%3A%2F%2Fdemi.example.org%2F", "/app/personal/medications"],
    ])("keeps the approved destination of %s", (url, expected) => {
      expect(resolve(url)).toBe(expected);
    });

    it.each([
      "/app/personal/medications?code=synthetic",
      "/app/personal/medications?state=x&liff.hback=2",
      "/app/patients/assigned?task=screening&task=screening&liff.hback=2",
      "/app/patients/assigned?task=followup&liff.hback=2&task=screening",
      "/app/patients/assigned?task=%73creening&liff.hback=2",
      "/app/patients/assigned?liff.hback=2&returnTo=https%3A%2F%2Fevil.example",
      "/app/personal?next=%2F%2Fevil.example&liff.hback=2",
      "/app/personal?%E0%A4%A=1&liff.hback=2",
      "/app/personal?&liff.hback=2",
      "/app/personal?liff.hback=2&",
      `/app/personal?liff.hback=2&${"liff.x=1&".repeat(40)}`,
      `/app/personal?liff.hback=${"2".repeat(5000)}`,
      "/app/hospitals/11111111-1111-4111-8111-111111111111?liff.hback=2",
      "/line/account?liff.hback=2",
      // Hospital work dashboard falls back to the default post-login destination.
      "/app?liff.hback=2",
    ])("rejects %s", (url) => {
      expect(resolve(url)).toBeNull();
    });

    it("canonicalizes only platform bookkeeping and keeps application segments raw and ordered", () => {
      expect(canonicalizeLineEntryPath(new URL("https://demi.example.org/app/x?b=2&liff.hback=2&a=1"))).toBe("/app/x?b=2&a=1");
      expect(canonicalizeLineEntryPath(new URL("https://demi.example.org/app/x?a=%2F"))).toBe("/app/x?a=%2F");
      expect(canonicalizeLineEntryPath(new URL("https://demi.example.org/app/x"))).toBe("/app/x");
    });
  });
});

describe("LINE quick-action destination allowlist", () => {
  it("ADR-0033: allowlists the Patient service request page for the no-upcoming-appointment reply", () => {
    expect(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_SERVICES).toBe("/app/personal/services");
    expect(LINE_QUICK_ACTION_RETURN_PATHS).toContain("/app/personal/services");
    const resolve = (url: string): string | null => getLineQuickActionReturnPathFromUrl(new URL(url, "https://demi.example.org"));
    expect(resolve("/app/personal/services?liff.hback=2")).toBe("/app/personal/services");
    expect(resolve("/app/personal/services?relationshipId=1")).toBeNull();
    expect(resolve("/app/personal/services/")).toBeNull();
  });

  it("keeps the Phase A ordinary appointment quick action unchanged", () => {
    expect(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_APPOINTMENTS).toBe("/app/personal/appointments");
    expect(LINE_QUICK_ACTION_RETURN_PATHS.every((path) => path.startsWith("/app"))).toBe(true);
  });
});
