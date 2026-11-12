import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWorkforceActivationUrlBuilder,
  getLineLiffId,
  getLineWorkspaceLiffId,
  isLineFlexMessagesEnabled,
  resolveLineWorkspaceLiffId,
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

describe("Workspace LIFF configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  function configure(values: Record<string, string | undefined>): void {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-Account");
    vi.stubEnv("DEMI_LINE_MINI_APP_LIFF_ID", "2000000001-MiniDev");
    for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
  }

  it("accepts a distinct Workspace LIFF inside the existing DEMI LINE Login channel", () => {
    configure({ NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID: "1234567890-Workspace" });
    expect(resolveLineWorkspaceLiffId()).toEqual({ status: "CONFIGURED", liffId: "1234567890-Workspace" });
    expect(getLineWorkspaceLiffId()).toBe("1234567890-Workspace");
    expect(getLineLiffId()).toBe("1234567890-Account");
  });

  it.each([
    [undefined, "UNSET"],
    ["", "UNSET"],
    ["   ", "UNSET"],
    ["not-a-liff-id", "INVALID_FORMAT"],
    ["1234567890-Work?returnTo=https://evil.example", "INVALID_FORMAT"],
    ["https://liff.line.me/1234567890-Workspace", "INVALID_FORMAT"],
    ["9999999999-Workspace", "NOT_IN_LOGIN_CHANNEL"],
    ["2000000001-MiniWorkspace", "NOT_IN_LOGIN_CHANNEL"],
    ["1234567890-Account", "SAME_AS_ACCOUNT_LIFF"],
  ] as const)("is unavailable for %j (%s) and never falls back to another LIFF identity", (value, issue) => {
    configure({ NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID: value });
    expect(resolveLineWorkspaceLiffId()).toEqual({ status: "UNAVAILABLE", issue });
    expect(getLineWorkspaceLiffId()).toBeNull();
  });

  it("rejects a Workspace LIFF equal to the MINI App LIFF", () => {
    configure({ DEMI_LINE_MINI_APP_LIFF_ID: "1234567890-Shared", NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID: "1234567890-Shared" });
    expect(resolveLineWorkspaceLiffId()).toEqual({ status: "UNAVAILABLE", issue: "SAME_AS_MINI_APP_LIFF" });
  });

  it("requires the Login channel to prove channel membership", () => {
    configure({ DEMI_LINE_LOGIN_CHANNEL_ID: "", NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID: "1234567890-Workspace" });
    expect(resolveLineWorkspaceLiffId()).toEqual({ status: "UNAVAILABLE", issue: "LOGIN_CHANNEL_UNAVAILABLE" });
  });

  it("does not make the Account LIFF depend on Workspace configuration", () => {
    configure({ NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID: "garbage" });
    expect(getLineLiffId()).toBe("1234567890-Account");
  });
});

describe("LINE Flex notification flag", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["TRUE", false],
    ["1", false],
    [" true", false],
    ["true", true],
  ] as const)("reads %s as %s", (value, expected) => {
    vi.stubEnv("DEMI_LINE_FLEX_MESSAGES_ENABLED", value);
    expect(isLineFlexMessagesEnabled()).toBe(expected);
  });
});
