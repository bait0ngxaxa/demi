import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LineFailure } from "../domain/line-errors";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "./account-http";

describe("LINE account HTTP boundary", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires the configured exact same origin", async () => {
    await expect(requireSameOrigin(new Request("https://demi.example.org", { method: "POST", headers: { origin: "https://demi.example.org" } }))).resolves.toBeUndefined();
    await expect(requireSameOrigin(new Request("https://demi.example.org", { method: "POST", headers: { origin: "https://evil.example" } }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireSameOrigin(new Request("https://demi.example.org", { method: "POST" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("bounds account request bytes and exposes only privacy-safe errors", async () => {
    const tooLarge = new Request("https://demi.example.org", { method: "POST", body: "x".repeat(32 * 1024 + 1) });
    await expect(readAccountJson(tooLarge)).rejects.toMatchObject({ code: "LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED" });
    const response = lineErrorResponse(new LineFailure("LINE_BINDING_CONFLICT"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "ไม่สามารถเชื่อมบัญชี LINE นี้ได้ กรุณาตรวจสอบบัญชีและลองใหม่" });
    expect(JSON.stringify(await lineErrorResponse(new LineFailure("LINE_BINDING_CONFLICT")).json())).not.toContain("Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });
});
