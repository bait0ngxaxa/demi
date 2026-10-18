import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import {
  getLineMiniAppConfiguration,
  getLineMiniAppDeauthorizationCredentials,
  isLineMiniAppWorkflowEnabled,
  isLineMiniAppWorkflowIssuanceEnabled,
} from "./line-mini-app-configuration";

// Synthetic identifiers only.
function setMiniEnvironment(overrides: Record<string, string | undefined> = {}): void {
  const values: Record<string, string | undefined> = {
    DEMI_LINE_PUBLIC_ORIGIN: "https://demi.example.org",
    DEMI_LINE_MINI_APP_ENVIRONMENT: "DEVELOPING",
    DEMI_LINE_MINI_APP_CHANNEL_ID: "2000000001",
    DEMI_LINE_MINI_APP_LIFF_ID: "2000000001-MiniDev",
    DEMI_LINE_MINI_APP_ENDPOINT_URL: "https://demi.example.org/line/workflow",
    DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE: "deploy:dev-1",
    DEMI_LINE_LOGIN_CHANNEL_ID: "1000000001",
    NEXT_PUBLIC_DEMI_LINE_LIFF_ID: "1000000001-Account",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

function expectUnavailable(): void {
  expect(() => getLineMiniAppConfiguration()).toThrow(LineWorkflowFailure);
  try {
    getLineMiniAppConfiguration();
  } catch (error) {
    expect((error as LineWorkflowFailure).code).toBe("MINI_CONFIGURATION_UNAVAILABLE");
  }
}

describe("selected MINI App environment tuple", () => {
  beforeEach(() => setMiniEnvironment());
  afterEach(() => vi.unstubAllEnvs());

  it.each(["DEVELOPING", "REVIEW", "PUBLISHED"])("returns exactly the configured %s tuple", (environment) => {
    setMiniEnvironment({ DEMI_LINE_MINI_APP_ENVIRONMENT: environment });
    expect(getLineMiniAppConfiguration()).toEqual({
      environment,
      channelId: "2000000001",
      liffId: "2000000001-MiniDev",
      origin: "https://demi.example.org",
      endpointUrl: "https://demi.example.org/line/workflow",
      deploymentReference: "deploy:dev-1",
    });
  });

  it("does not select PUBLISHED from NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    setMiniEnvironment({ DEMI_LINE_MINI_APP_ENVIRONMENT: undefined });
    expectUnavailable();
  });

  it.each([
    ["missing environment", { DEMI_LINE_MINI_APP_ENVIRONMENT: undefined }],
    ["unknown environment", { DEMI_LINE_MINI_APP_ENVIRONMENT: "PRODUCTION" }],
    ["lower-case environment", { DEMI_LINE_MINI_APP_ENVIRONMENT: "published" }],
    ["missing channel", { DEMI_LINE_MINI_APP_CHANNEL_ID: undefined }],
    ["non-numeric channel", { DEMI_LINE_MINI_APP_CHANNEL_ID: "channel-1" }],
    ["missing LIFF ID", { DEMI_LINE_MINI_APP_LIFF_ID: undefined }],
    ["malformed LIFF ID", { DEMI_LINE_MINI_APP_LIFF_ID: "MiniDev" }],
    ["missing deployment", { DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE: undefined }],
    ["unsafe deployment", { DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE: "deploy one" }],
    ["missing endpoint", { DEMI_LINE_MINI_APP_ENDPOINT_URL: undefined }],
    ["endpoint path mismatch", { DEMI_LINE_MINI_APP_ENDPOINT_URL: "https://demi.example.org/line/workflow/appointments" }],
    ["endpoint trailing slash", { DEMI_LINE_MINI_APP_ENDPOINT_URL: "https://demi.example.org/line/workflow/" }],
    ["endpoint query", { DEMI_LINE_MINI_APP_ENDPOINT_URL: "https://demi.example.org/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS" }],
    ["endpoint other origin", { DEMI_LINE_MINI_APP_ENDPOINT_URL: "https://attacker.example/line/workflow" }],
    ["non-canonical origin", { DEMI_LINE_PUBLIC_ORIGIN: "https://demi.example.org/", DEMI_LINE_MINI_APP_ENDPOINT_URL: "https://demi.example.org//line/workflow" }],
    ["local HTTP origin", { DEMI_LINE_PUBLIC_ORIGIN: "http://localhost:3000", DEMI_LINE_MINI_APP_ENDPOINT_URL: "http://localhost:3000/line/workflow" }],
    ["Account channel reused as MINI audience", { DEMI_LINE_MINI_APP_CHANNEL_ID: "1000000001" }],
    ["Account LIFF reused as MINI LIFF", { DEMI_LINE_MINI_APP_LIFF_ID: "1000000001-Account" }],
  ])("fails closed for %s", (_label, overrides) => {
    setMiniEnvironment(overrides);
    expectUnavailable();
  });

  it("does not derive the channel ID from the LIFF ID prefix", () => {
    setMiniEnvironment({ DEMI_LINE_MINI_APP_CHANNEL_ID: undefined, DEMI_LINE_MINI_APP_LIFF_ID: "2000000001-MiniDev" });
    expectUnavailable();
  });

  it("selects a MINI deauthorization secret only with the exact MINI tuple", () => {
    vi.stubEnv("DEMI_LINE_MINI_APP_CHANNEL_SECRET", "synthetic-mini-channel-secret");
    expect(getLineMiniAppDeauthorizationCredentials()).toEqual({
      channelId: "2000000001", channelSecret: "synthetic-mini-channel-secret",
      environment: "DEVELOPING", deploymentReference: "deploy:dev-1",
    });
  });

  it.each([undefined, "", "short"]) ("fails closed for missing or invalid MINI channel credentials (%s)", (secret) => {
    vi.stubEnv("DEMI_LINE_MINI_APP_CHANNEL_SECRET", secret);
    expect(() => getLineMiniAppDeauthorizationCredentials()).toThrow(LineWorkflowFailure);
  });
});

describe("MINI workflow activation gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "", "false", "TRUE", "1", "yes"])("stays disabled for %s", (value) => {
    vi.stubEnv("DEMI_LINE_MINI_APP_WORKFLOW_ENABLED", value);
    expect(isLineMiniAppWorkflowEnabled()).toBe(false);
  });

  it("enables orchestration only for the literal true", () => {
    vi.stubEnv("DEMI_LINE_MINI_APP_WORKFLOW_ENABLED", "true");
    expect(isLineMiniAppWorkflowEnabled()).toBe(true);
  });
});

describe("MINI context issuance activation gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "", "false", "TRUE", "1", "yes"])("stays disabled for %s", (value) => {
    vi.stubEnv("DEMI_LINE_MINI_APP_ISSUANCE_ENABLED", value);
    expect(isLineMiniAppWorkflowIssuanceEnabled()).toBe(false);
  });

  it("enables issuance only for the literal true independent of NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_LINE_MINI_APP_ISSUANCE_ENABLED", "true");
    expect(isLineMiniAppWorkflowIssuanceEnabled()).toBe(true);
  });
});
