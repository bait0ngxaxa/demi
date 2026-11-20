import { describe, expect, it } from "vitest";

import { LEGACY_OSM_SCREENING_PATH } from "@/modules/line/domain/line-navigation-intents";

import { buildLoginReturnHref } from "./login-return";

describe("bounded login return href", () => {
  // The former รอคัดกรอง entry keeps its login return; the assigned list then redirects it to /app/services.
  it("encodes only an approved quick-action destination", () => {
    expect(buildLoginReturnHref(LEGACY_OSM_SCREENING_PATH)).toBe(
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
