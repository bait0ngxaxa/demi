import { describe, expect, it } from "vitest";

import { parentOwnerInviteeSchema, parentOwnerLinkIssueSchema, parentOwnerInvitationTargetSchema } from "./parent-owner-invitation-schemas";

const hospitalId = "44444444-4444-4444-8444-444444444444";
const validInput = {
  hospitalId: hospitalId.toUpperCase(),
  nationalId: "1000000000009",
  givenName: " สมศักดิ์ ",
  familyName: "ผู้ดูแล",
  mode: "REMOTE",
  submissionNonce: "55555555-5555-4555-8555-555555555555",
};

describe("Parent OWNER invitation schemas (ADR-0024)", () => {
  it("normalizes the Hospital id and the invitee name", () => {
    const result = parentOwnerInviteeSchema.safeParse(validInput);

    expect(result.success).toBe(true);
    expect(result.data?.hospitalId).toBe(hospitalId);
    expect(result.data?.givenName).toBe("สมศักดิ์");
  });

  it.each([
    { ...validInput, nationalId: "123" },
    { ...validInput, mode: "EMAIL" },
    { ...validInput, submissionNonce: "not-a-nonce" },
    { ...validInput, givenName: "" },
    { ...validInput, invitedByUserId: hospitalId },
    { ...validInput, role: "ADMIN" },
  ])("rejects invalid or client-authority input", (input) => {
    expect(parentOwnerInviteeSchema.safeParse(input).success).toBe(false);
  });

  it("accepts only the Hospital (and a delivery mode) for link and target operations", () => {
    expect(parentOwnerInvitationTargetSchema.safeParse({ hospitalId }).success).toBe(true);
    expect(parentOwnerInvitationTargetSchema.safeParse({ hospitalId, membershipId: hospitalId }).success).toBe(false);
    expect(parentOwnerLinkIssueSchema.safeParse({ hospitalId, mode: "ASSISTED" }).success).toBe(true);
    expect(parentOwnerLinkIssueSchema.safeParse({ hospitalId }).success).toBe(false);
  });
});
