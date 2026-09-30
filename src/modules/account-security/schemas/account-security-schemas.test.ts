import { describe, expect, it } from "vitest";

import {
  accountRecoveryCompletionSchema,
  accountRecoveryIssueSchema,
  authenticatedPasswordChangeSchema,
} from "./account-security-schemas";

const nationalId = "1000000000009";
const validPassword = "A-very-long-safe-password";

describe("account security schemas", () => {
  it("requires current password, policy-compliant matching new password, and no target account", () => {
    expect(
      authenticatedPasswordChangeSchema.parse({
        currentPassword: "current secret",
        newPassword: validPassword,
        passwordConfirmation: validPassword,
      }),
    ).toMatchObject({ newPassword: validPassword });
    expect(
      authenticatedPasswordChangeSchema.safeParse({
        currentPassword: "current secret",
        newPassword: "short",
        passwordConfirmation: "short",
      }).success,
    ).toBe(false);
    expect(
      authenticatedPasswordChangeSchema.safeParse({
        currentPassword: "current secret",
        newPassword: validPassword,
        passwordConfirmation: "different-password",
      }).success,
    ).toBe(false);
    expect(
      authenticatedPasswordChangeSchema.safeParse({
        currentPassword: "current secret",
        newPassword: validPassword,
        passwordConfirmation: validPassword,
        authSubject: "provider-user-id",
      }).success,
    ).toBe(false);
  });

  it("requires matching National ID entries and explicit assisted verification", () => {
    expect(
      accountRecoveryIssueSchema.parse({
        nationalId,
        nationalIdConfirmation: nationalId,
        identityVerified: true,
      }),
    ).toMatchObject({ identityVerified: true });
    expect(
      accountRecoveryIssueSchema.safeParse({
        nationalId,
        nationalIdConfirmation: "1000000000017",
        identityVerified: true,
      }).success,
    ).toBe(false);
    expect(
      accountRecoveryIssueSchema.safeParse({
        nationalId,
        nationalIdConfirmation: nationalId,
        identityVerified: false,
      }).success,
    ).toBe(false);
  });

  it("requires the opaque one-time token and matching policy-compliant claimant password", () => {
    expect(
      accountRecoveryCompletionSchema.safeParse({
        token: "A".repeat(43),
        newPassword: validPassword,
        passwordConfirmation: validPassword,
      }).success,
    ).toBe(true);
    expect(
      accountRecoveryCompletionSchema.safeParse({
        token: "A".repeat(43),
        newPassword: validPassword,
        passwordConfirmation: "other-password",
      }).success,
    ).toBe(false);
  });
});
