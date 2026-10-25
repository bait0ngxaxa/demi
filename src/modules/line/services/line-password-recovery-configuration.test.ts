import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isLinePasswordRecoveryCompletionConfigured,
  isLinePasswordRecoveryRequestConfigured,
} from "./line-password-recovery-configuration";

const requiredConfiguration = {
  DEMI_LINE_LOGIN_CHANNEL_ID: "1234567890",
  DEMI_LINE_PUBLIC_ORIGIN: "https://demi.example.org",
  IDENTITY_HASH_SECRET: "line-password-recovery-identity-hash-secret",
  NEXT_PUBLIC_DEMI_LINE_LIFF_ID: "1234567890-Recovery",
  DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "synthetic-messaging-access-token",
};

function stubRequiredConfiguration(): void {
  for (const [name, value] of Object.entries(requiredConfiguration)) {
    vi.stubEnv(name, value);
  }
}

describe("LINE password-recovery configuration", () => {
  beforeEach(stubRequiredConfiguration);
  afterEach(() => vi.unstubAllEnvs());

  it("enables request and completion UI when their required configuration is locally valid", () => {
    expect(isLinePasswordRecoveryRequestConfigured()).toBe(true);
    expect(isLinePasswordRecoveryCompletionConfigured()).toBe(true);
  });

  it.each(Object.keys(requiredConfiguration))("marks request recovery unavailable when %s is missing", (name) => {
    vi.stubEnv(name, undefined);

    expect(isLinePasswordRecoveryRequestConfigured()).toBe(false);
  });

  it.each([
    ["DEMI_LINE_LOGIN_CHANNEL_ID", "invalid-channel"],
    ["DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org/path"],
    ["IDENTITY_HASH_SECRET", "short"],
    ["NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "invalid-liff-id"],
    ["DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "   "],
  ])("marks request recovery unavailable when %s is invalid", (name, value) => {
    vi.stubEnv(name, value);

    expect(isLinePasswordRecoveryRequestConfigured()).toBe(false);
  });

  it("requires no Messaging API settings to complete an already-issued recovery link", () => {
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", undefined);

    expect(isLinePasswordRecoveryCompletionConfigured()).toBe(true);
    expect(isLinePasswordRecoveryRequestConfigured()).toBe(false);
  });

  it("does not require Messaging channel-secret or bot-user settings for push recovery", () => {
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_SECRET", undefined);
    vi.stubEnv("DEMI_LINE_MESSAGING_BOT_USER_ID", undefined);

    expect(isLinePasswordRecoveryRequestConfigured()).toBe(true);
  });

  it("does not vary with NODE_ENV or deployment labels", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_DEPLOYMENT_STAGE", "production");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(isLinePasswordRecoveryRequestConfigured()).toBe(true);
  });
});
