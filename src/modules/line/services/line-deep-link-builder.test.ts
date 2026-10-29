import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_WEB_NAVIGATION_PATHS } from "../domain/line-navigation-intents";
import { LineFailure } from "../domain/line-errors";
import { buildLineIntentUrl, getPublicLineAccountEntryUrl } from "./line-deep-link-builder";

describe("LINE intent deep links", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(Object.entries(LINE_WEB_NAVIGATION_PATHS))(
    "builds the fixed same-origin web destination for %s",
    (intent, path) => {
      const url = new URL(buildLineIntentUrl(intent as keyof typeof LINE_WEB_NAVIGATION_PATHS));

      expect(url.origin).toBe("https://demi.example.org");
      expect(`${url.pathname}${url.search}`).toBe(path);
      expect(url.username).toBe("");
      expect(url.password).toBe("");
      expect(url.hash).toBe("");
    },
  );

  it("includes only bounded OSM task modes in the quick-action URLs", () => {
    expect(buildLineIntentUrl("START_OSM_SCREENING")).toBe(
      "https://demi.example.org/app/patients/assigned?task=screening",
    );
    // CT-3: the follow-up entry opens the จัดบริการ workspace.
    expect(buildLineIntentUrl("START_OSM_FOLLOWUP")).toBe(
      "https://demi.example.org/app/services",
    );
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

  it("returns the configured public account entry without activation credentials", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
    expect(getPublicLineAccountEntryUrl()).toBe(buildLineIntentUrl("LINK_ACCOUNT"));
    expect(new URL(getPublicLineAccountEntryUrl() ?? "").search).toBe("");
  });

  it.each(["", "https://evil.example/", "1234-Abc?returnTo=https://evil.example/", "1234-Abc#secret"])("fails safely for invalid or missing LIFF configuration %s", (value) => {
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", value);
    expect(getPublicLineAccountEntryUrl()).toBeNull();
  });

  it("keeps web fallback available when the server origin is invalid", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://user:password@evil.example/path");
    expect(getPublicLineAccountEntryUrl()).toBeNull();
  });
});
