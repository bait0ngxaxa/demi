import { describe, expect, it } from "vitest";

import {
  generateWorkforceActivationCredential,
  getWorkforceActivationExpiry,
  hashWorkforceActivationToken,
  WORKFORCE_ASSISTED_ACTIVATION_TTL_MS,
  WORKFORCE_REMOTE_ACTIVATION_TTL_MS,
} from "./activation-token-service";

describe("workforce activation credentials", () => {
  it("generates a 256-bit opaque credential and only exposes its digest for persistence", () => {
    const credential = generateWorkforceActivationCredential();

    expect(Buffer.from(credential.plaintextToken, "base64url")).toHaveLength(32);
    expect(credential.tokenHash).toHaveLength(64);
    expect(credential.tokenHash).not.toBe(credential.plaintextToken);
    expect(hashWorkforceActivationToken(credential.plaintextToken)).toBe(credential.tokenHash);
  });

  it("uses the accepted remote and assisted expiry defaults", () => {
    const now = new Date("2026-08-14T00:00:00.000Z");

    expect(getWorkforceActivationExpiry(now, "REMOTE").getTime()).toBe(
      now.getTime() + WORKFORCE_REMOTE_ACTIVATION_TTL_MS,
    );
    expect(getWorkforceActivationExpiry(now, "ASSISTED").getTime()).toBe(
      now.getTime() + WORKFORCE_ASSISTED_ACTIVATION_TTL_MS,
    );
  });

  it("does not accept an empty token for digest lookup", () => {
    expect(() => hashWorkforceActivationToken(" ")).toThrow();
  });
});
