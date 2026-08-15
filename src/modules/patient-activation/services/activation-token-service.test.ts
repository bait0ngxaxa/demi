import { describe, expect, it } from "vitest";

import {
  generatePatientActivationCredential,
  getPatientActivationExpiry,
  hashPatientActivationToken,
  PATIENT_ACTIVATION_TTL_MS,
} from "./activation-token-service";

describe("patient activation credentials", () => {
  it("generates a 256-bit opaque credential and stores only its digest", () => {
    const credential = generatePatientActivationCredential();

    expect(Buffer.from(credential.plaintextToken, "base64url")).toHaveLength(32);
    expect(credential.tokenHash).toHaveLength(64);
    expect(credential.tokenHash).not.toBe(credential.plaintextToken);
    expect(hashPatientActivationToken(credential.plaintextToken)).toBe(credential.tokenHash);
  });

  it("uses one centrally defined reversible MVP expiry", () => {
    const now = new Date("2026-08-15T00:00:00.000Z");

    expect(getPatientActivationExpiry(now).getTime()).toBe(now.getTime() + PATIENT_ACTIVATION_TTL_MS);
  });

  it("rejects blank tokens", () => {
    expect(() => hashPatientActivationToken(" ")).toThrow();
  });
});
