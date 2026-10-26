import { describe, expect, it } from "vitest";

import {
  accountRecoveryCompletionSchema,
  accountRecoveryIssueSchema,
  authenticatedPasswordChangeSchema,
  mediatedPasswordResetCompletionSchema,
  mediatedPasswordResetIssueSchema,
  mediatedPasswordResetSearchSchema,
  platformAdminMediatedPasswordResetSearchSchema,
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

  it("accepts custom login identifiers only through Platform ADMIN search and completion schemas", () => {
    const customIdentifier = "demi-admin.recovery";

    expect(platformAdminMediatedPasswordResetSearchSchema.safeParse({ nationalId: customIdentifier }).success).toBe(true);
    expect(mediatedPasswordResetSearchSchema.safeParse({ nationalId: customIdentifier }).success).toBe(false);
    expect(mediatedPasswordResetCompletionSchema.safeParse({
      token: "A".repeat(43),
      platformAdminIdentifier: customIdentifier,
      newPassword: validPassword,
      passwordConfirmation: validPassword,
    }).success).toBe(true);
    expect(mediatedPasswordResetCompletionSchema.safeParse({
      token: "A".repeat(43),
      platformAdminIdentifier: customIdentifier,
      nationalId,
      newPassword: validPassword,
      passwordConfirmation: validPassword,
    }).success).toBe(false);
  });

  it("requires Platform ADMIN resets to have a null Hospital context and keeps other targets scoped", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const hospitalId = "22222222-2222-4222-8222-222222222222";
    const relationshipId = "33333333-3333-4333-8333-333333333333";
    const base = { mode: "ONLINE" as const, verificationMethod: "IN_PERSON_ID_CARD" as const };

    expect(mediatedPasswordResetIssueSchema.safeParse({
      ...base,
      targetKind: "platform_admin",
      targetUserId: userId,
      hospitalId: null,
      relationshipId: null,
    }).success).toBe(true);
    expect(mediatedPasswordResetIssueSchema.safeParse({
      ...base,
      targetKind: "platform_admin",
      targetUserId: userId,
      hospitalId,
      relationshipId: null,
    }).success).toBe(false);
    expect(mediatedPasswordResetIssueSchema.safeParse({
      ...base,
      targetKind: "patient",
      hospitalId: null,
      relationshipId,
    }).success).toBe(false);
    expect(mediatedPasswordResetIssueSchema.safeParse({
      ...base,
      targetKind: "patient",
      hospitalId,
      relationshipId,
    }).success).toBe(true);
  });
});
