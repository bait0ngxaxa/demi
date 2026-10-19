import { describe, expect, it } from "vitest";

import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import { getPatientSelfLoginHref } from "./patient-self-session";

describe("Patient self-service session return", () => {
  it("returns to the fixed LINE quick-action entry path", () => {
    expect(getPatientSelfLoginHref(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_WELLNESS)).toBe(
      "/login?returnTo=%2Fapp%2Fpersonal%2Fwellness",
    );
  });

  it.each([
    "/app/personal/appointments/relationship/appointment",
    "/app/personal/measurements",
    "/app/personal/wellness?cursor=opaque",
    "/app/family/invitations#secret-token",
    "/line/account",
    "https://attacker.example",
    "/login?returnTo=%2Fapp",
  ])("does not include a non-allowlisted return path: %s", (returnTo) => {
    expect(getPatientSelfLoginHref(returnTo)).toBe("/login");
  });
});
