import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyLineWebhookSignature } from "./line-webhook-security";

describe("LINE webhook signature verification", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_SECRET", "dedicated-demi-line-messaging-secret");
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "dedicated-demi-line-access-token");
    vi.stubEnv("DEMI_LINE_MESSAGING_BOT_USER_ID", `U${"a".repeat(32)}`);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("verifies the exact raw bytes using HMAC-SHA256", () => {
    const bytes = new TextEncoder().encode('{"text":"ไทย","events":[]}');
    const signature = createHmac("sha256", "dedicated-demi-line-messaging-secret").update(bytes).digest("base64");
    expect(verifyLineWebhookSignature(bytes, signature)).toBe(true);
    expect(verifyLineWebhookSignature(new TextEncoder().encode('{"text":"ไทย","events": []}'), signature)).toBe(false);
    expect(verifyLineWebhookSignature(bytes, "not-a-signature")).toBe(false);
  });
});
