import { afterEach, describe, expect, it, vi } from "vitest";

import { isMedicationLineRemindersDisabled } from "./server";

describe("medication LINE reminder kill switch", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "", "  ", "false", " false "])("leaves reminders running for %j", (value) => {
    vi.stubEnv("DEMI_LINE_MEDICATION_REMINDERS_DISABLED", value);
    expect(isMedicationLineRemindersDisabled()).toBe(false);
  });

  it.each(["true", "TRUE", "1", "yes", "False"])("disables reminders for %j", (value) => {
    vi.stubEnv("DEMI_LINE_MEDICATION_REMINDERS_DISABLED", value);
    expect(isMedicationLineRemindersDisabled()).toBe(true);
  });
});
