import { describe, expect, it } from "vitest";

import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";

import { buildLoginReturnHref } from "./login-return";

describe("bounded login return href", () => {
  it("encodes only an approved quick-action destination", () => {
    expect(buildLoginReturnHref(LINE_WEB_NAVIGATION_PATHS.START_OSM_SCREENING)).toBe(
      "/login?returnTo=%2Fapp%2Fpatients%2Fassigned%3Ftask%3Dscreening",
    );
  });

  it.each([
    "https://attacker.example/",
    "//attacker.example/",
    "/app/patients/assigned?task=screening&next=/app",
    "/app/patients/assigned?task=screening%252f..%252f..",
  ])("falls back to plain login for an unapproved return target %s", (value) => {
    expect(buildLoginReturnHref(value)).toBe("/login");
  });
});
