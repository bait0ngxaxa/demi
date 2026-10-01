import { describe, expect, it } from "vitest";

import {
  generateCaregiverInvitationCredential,
  hashCaregiverInvitationToken,
} from "./caregiver-invitation-token-service";

describe("caregiver invitation credentials", () => {
  it("generates 256-bit opaque tokens and stores only a stable one-way digest", () => {
    const first = generateCaregiverInvitationCredential();
    const second = generateCaregiverInvitationCredential();

    expect(first.plaintextToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.tokenHash).not.toBe(first.plaintextToken);
    expect(hashCaregiverInvitationToken(first.plaintextToken)).toBe(first.tokenHash);
    expect(second.plaintextToken).not.toBe(first.plaintextToken);
  });
});
