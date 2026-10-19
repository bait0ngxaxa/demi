import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import {
  getLineMiniAppConfiguration,
  getLineMiniAppDeauthorizationCredentials,
  isLineMiniAppDisabled,
  resolveLineMiniAppChannel,
} from "./line-mini-app-configuration";

const MINI_VARIABLES = [
  "DEMI_LINE_MINI_APP_ENVIRONMENT",
  "DEMI_LINE_MINI_APP_CHANNEL_ID",
  "DEMI_LINE_MINI_APP_LIFF_ID",
  "DEMI_LINE_MINI_APP_CHANNEL_SECRET",
  "DEMI_LINE_MINI_APP_CONTEXT_KEYRING",
  "DEMI_LINE_MINI_APP_DISABLED",
] as const;

// Synthetic identifiers only.
function setMiniEnvironment(overrides: Record<string, string | undefined> = {}): void {
  const values: Record<string, string | undefined> = {
    DEMI_LINE_PUBLIC_ORIGIN: "https://demi.example.org",
    DEMI_LINE_MINI_APP_ENVIRONMENT: "DEVELOPING",
    DEMI_LINE_MINI_APP_CHANNEL_ID: "2000000001",
    DEMI_LINE_MINI_APP_LIFF_ID: "2000000001-MiniDev",
    DEMI_LINE_MINI_APP_CHANNEL_SECRET: undefined,
    DEMI_LINE_MINI_APP_CONTEXT_KEYRING: undefined,
    DEMI_LINE_MINI_APP_DISABLED: undefined,
    DEMI_LINE_LOGIN_CHANNEL_ID: "1000000001",
    IDENTITY_HASH_SECRET: "synthetic-secret-at-least-32-characters",
    NEXT_PUBLIC_DEMI_LINE_LIFF_ID: "1000000001-Account",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

function failureCode(read: () => unknown): string | undefined {
  try {
    read();
  } catch (error) {
    expect(error).toBeInstanceOf(LineWorkflowFailure);
    return (error as LineWorkflowFailure).code;
  }
  return undefined;
}

describe("selected MINI App channel", () => {
  beforeEach(() => setMiniEnvironment());
  afterEach(() => vi.unstubAllEnvs());

  it.each(["DEVELOPING", "REVIEW", "PUBLISHED"])("returns exactly the configured %s channel with a derived endpoint", (environment) => {
    setMiniEnvironment({ DEMI_LINE_MINI_APP_ENVIRONMENT: environment });
    expect(getLineMiniAppConfiguration()).toEqual({
      environment,
      channelId: "2000000001",
      liffId: "2000000001-MiniDev",
      origin: "https://demi.example.org",
      endpointUrl: "https://demi.example.org/line/workflow",
    });
  });

  it("needs no activation, issuance, endpoint or deployment variable", () => {
    for (const legacy of [
      "DEMI_LINE_MINI_APP_WORKFLOW_ENABLED", "DEMI_LINE_MINI_APP_ISSUANCE_ENABLED",
      "DEMI_LINE_MINI_APP_ENDPOINT_URL", "DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE",
    ]) vi.stubEnv(legacy, undefined);
    expect(getLineMiniAppConfiguration().channelId).toBe("2000000001");
  });

  it("treats a completely absent MINI configuration as not provisioned, never as available", () => {
    for (const name of MINI_VARIABLES) vi.stubEnv(name, undefined);
    expect(resolveLineMiniAppChannel()).toBeNull();
    expect(failureCode(getLineMiniAppConfiguration)).toBe("MINI_CONFIGURATION_UNAVAILABLE");
  });

  it("does not select PUBLISHED from NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    setMiniEnvironment({ DEMI_LINE_MINI_APP_ENVIRONMENT: undefined });
    expect(failureCode(resolveLineMiniAppChannel)).toBe("MINI_CONFIGURATION_UNAVAILABLE");
  });

  it.each([
    ["missing environment", { DEMI_LINE_MINI_APP_ENVIRONMENT: undefined }],
    ["unknown environment", { DEMI_LINE_MINI_APP_ENVIRONMENT: "PRODUCTION" }],
    ["lower-case environment", { DEMI_LINE_MINI_APP_ENVIRONMENT: "published" }],
    ["missing channel", { DEMI_LINE_MINI_APP_CHANNEL_ID: undefined }],
    ["non-numeric channel", { DEMI_LINE_MINI_APP_CHANNEL_ID: "channel-1" }],
    ["missing LIFF ID", { DEMI_LINE_MINI_APP_LIFF_ID: undefined }],
    ["malformed LIFF ID", { DEMI_LINE_MINI_APP_LIFF_ID: "MiniDev" }],
    ["only a keyring", { DEMI_LINE_MINI_APP_ENVIRONMENT: undefined, DEMI_LINE_MINI_APP_CHANNEL_ID: undefined, DEMI_LINE_MINI_APP_LIFF_ID: undefined, DEMI_LINE_MINI_APP_CONTEXT_KEYRING: "{}" }],
    ["only a channel secret", { DEMI_LINE_MINI_APP_ENVIRONMENT: undefined, DEMI_LINE_MINI_APP_CHANNEL_ID: undefined, DEMI_LINE_MINI_APP_LIFF_ID: undefined, DEMI_LINE_MINI_APP_CHANNEL_SECRET: "synthetic-mini-channel-secret" }],
    ["non-canonical origin", { DEMI_LINE_PUBLIC_ORIGIN: "https://demi.example.org/" }],
    ["local HTTP origin", { DEMI_LINE_PUBLIC_ORIGIN: "http://localhost:3000" }],
    ["missing Account Login channel", { DEMI_LINE_LOGIN_CHANNEL_ID: undefined }],
    ["Account channel reused as MINI audience", { DEMI_LINE_MINI_APP_CHANNEL_ID: "1000000001" }],
    ["Account LIFF reused as MINI LIFF", { DEMI_LINE_MINI_APP_LIFF_ID: "1000000001-Account" }],
  ])("fails closed for partial or invalid configuration: %s", (_label, overrides) => {
    setMiniEnvironment(overrides);
    expect(failureCode(resolveLineMiniAppChannel)).toBe("MINI_CONFIGURATION_UNAVAILABLE");
    expect(failureCode(getLineMiniAppConfiguration)).toBe("MINI_CONFIGURATION_UNAVAILABLE");
  });

  it("does not derive the channel ID from the LIFF ID prefix", () => {
    setMiniEnvironment({ DEMI_LINE_MINI_APP_CHANNEL_ID: undefined, DEMI_LINE_MINI_APP_LIFF_ID: "2000000001-MiniDev" });
    expect(failureCode(resolveLineMiniAppChannel)).toBe("MINI_CONFIGURATION_UNAVAILABLE");
  });

  it("selects the MINI deauthorization secret only with the exact MINI channel", () => {
    vi.stubEnv("DEMI_LINE_MINI_APP_CHANNEL_SECRET", "synthetic-mini-channel-secret");
    expect(getLineMiniAppDeauthorizationCredentials()).toEqual({
      channelId: "2000000001", channelSecret: "synthetic-mini-channel-secret", environment: "DEVELOPING",
    });
  });

  it.each([undefined, "", "short"])("fails closed for missing or invalid MINI channel credentials (%s)", (secret) => {
    vi.stubEnv("DEMI_LINE_MINI_APP_CHANNEL_SECRET", secret);
    expect(failureCode(getLineMiniAppDeauthorizationCredentials)).toBe("MINI_CONFIGURATION_UNAVAILABLE");
    // A missing secret limits only remote MINI deauthorization, not the channel itself.
    expect(getLineMiniAppConfiguration().channelId).toBe("2000000001");
  });

  it("never falls back to Account credentials for MINI deauthorization", () => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_SECRET", "synthetic-account-channel-secret");
    expect(failureCode(getLineMiniAppDeauthorizationCredentials)).toBe("MINI_CONFIGURATION_UNAVAILABLE");
  });
});

describe("MINI emergency kill switch", () => {
  beforeEach(() => setMiniEnvironment());
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "", "false"])("leaves a valid MINI channel available for %s", (value) => {
    vi.stubEnv("DEMI_LINE_MINI_APP_DISABLED", value);
    expect(isLineMiniAppDisabled()).toBe(false);
    expect(getLineMiniAppConfiguration().channelId).toBe("2000000001");
  });

  it.each(["true", "TRUE", "1", "yes", "False"])("denies all MINI access for %s", (value) => {
    vi.stubEnv("DEMI_LINE_MINI_APP_DISABLED", value);
    expect(isLineMiniAppDisabled()).toBe(true);
    expect(failureCode(getLineMiniAppConfiguration)).toBe("WORKFLOW_DISABLED");
  });

  it("still denies when the MINI configuration is also invalid", () => {
    setMiniEnvironment({ DEMI_LINE_MINI_APP_DISABLED: "true", DEMI_LINE_MINI_APP_CHANNEL_ID: undefined });
    expect(failureCode(getLineMiniAppConfiguration)).toBe("WORKFLOW_DISABLED");
  });

  it("keeps the selected channel and its credentials for termination while disabled", () => {
    vi.stubEnv("DEMI_LINE_MINI_APP_DISABLED", "true");
    vi.stubEnv("DEMI_LINE_MINI_APP_CHANNEL_SECRET", "synthetic-mini-channel-secret");
    expect(resolveLineMiniAppChannel()?.channelId).toBe("2000000001");
    expect(getLineMiniAppDeauthorizationCredentials().channelId).toBe("2000000001");
  });
});
