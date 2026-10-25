import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWorkforceActivationUrlBuilder,
} from "./server";

describe("workforce activation URL builder", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the configured public origin and keeps the encoded token in the fragment", () => {
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://public.demi.example");
    const urls = createWorkforceActivationUrlBuilder();

    expect(urls.origin).toBe("https://public.demi.example");
    expect(urls.build("token#with?reserved/chars")).toBe(
      "https://public.demi.example/activate/workforce#token%23with%3Freserved%2Fchars",
    );
  });

  it("fails with the configured-origin error when no public origin is set", () => {
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "");

    expect(() => createWorkforceActivationUrlBuilder()).toThrow(
      "Application public origin is unavailable",
    );
  });
});
