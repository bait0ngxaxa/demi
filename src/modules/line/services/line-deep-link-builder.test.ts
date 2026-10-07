import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LineFailure } from "../domain/line-errors";
import { buildLineIntentUrl } from "./line-deep-link-builder";

describe("LINE intent deep links", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses existing authorized Personal and Work routes", () => {
    expect(buildLineIntentUrl("OPEN_PATIENT_WORKSPACE")).toBe("https://demi.example.org/app/personal");
    expect(buildLineIntentUrl("OPEN_WORK_WORKSPACE")).toBe("https://demi.example.org/app");
  });

  it("uses the LIFF root when the configured endpoint already contains /line/account", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
    const endpoint = "https://demi.example.org/line/account";
    const linkUrl = buildLineIntentUrl("LINK_ACCOUNT");
    const manageUrl = buildLineIntentUrl("MANAGE_ACCOUNT");

    expect(endpoint).toBe("https://demi.example.org/line/account");
    expect(linkUrl).toBe("https://liff.line.me/1234567890-AbCdEfGh");
    expect(manageUrl).toBe("https://liff.line.me/1234567890-AbCdEfGh");
    expect(new URL(linkUrl).pathname).not.toContain("/line/account");
  });

  it("fails with a typed configuration error when LIFF is required but missing", () => {
    expect(() => buildLineIntentUrl("SWITCH_WORKSPACE")).toThrowError(LineFailure);
    expect(() => buildLineIntentUrl("SWITCH_WORKSPACE")).toThrowError(expect.objectContaining({ code: "LINE_CONFIGURATION_MISSING" }));
  });
});
