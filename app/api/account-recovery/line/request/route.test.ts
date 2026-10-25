import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE } from "@/modules/line/services/line-password-recovery-service";
import { POST } from "./route";

describe("LINE recovery request API configuration failures", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", undefined);
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", undefined);
    vi.stubEnv("IDENTITY_HASH_SECRET", undefined);
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", undefined);
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keeps direct requests non-disclosing when LINE configuration is absent", async () => {
    const response = await POST(new Request("https://demi.example.org/api/account-recovery/line/request", {
      method: "POST",
      headers: { origin: "https://demi.example.org", "content-type": "application/json" },
      body: JSON.stringify({ nationalId: "1234567890123" }),
    }));

    const bodyText = await response.clone().text();
    await expect(response.json()).resolves.toEqual({ message: LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(bodyText).not.toContain("configuration");
    expect(bodyText).not.toContain("DEMI_LINE");
  });
});
