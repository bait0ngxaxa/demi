import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_FLEX_SAMPLES } from "./line-flex-samples.ts";

describe("line:flex:validate samples", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID", "1234567890-WorkSpace");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("names every sample once", () => {
    const names = LINE_FLEX_SAMPLES.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(LINE_FLEX_SAMPLES.map((sample) => [sample.name, sample]))("builds %s as a Flex message with a LIFF button only", (_name, sample) => {
    const message = sample.build();
    expect(message.type).toBe("flex");
    const json = JSON.stringify(message);
    expect(json).not.toContain("demi.example.org");
    expect(message.altText).not.toMatch(/:\/\/|liff\.line\.me/u);
  });
});
