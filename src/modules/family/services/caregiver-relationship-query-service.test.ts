import { describe, expect, it } from "vitest";

import { caregiverRelationshipQueryInternals } from "./caregiver-relationship-query-service";

describe("Family management query projections", () => {
  it("selects only invitation and lifecycle fields for the Patient perspective", () => {
    expect(caregiverRelationshipQueryInternals.invitationManagementSelect).toEqual({
      id: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
    });
    expect(caregiverRelationshipQueryInternals.relationshipManagementSelect).toEqual({
      id: true,
      status: true,
      activatedAt: true,
      revokedAt: true,
      withdrawnAt: true,
    });
  });

  it("does not widen caregiver management projections to include Patient or identity fields", () => {
    expect(caregiverRelationshipQueryInternals.caregiverInvitationManagementSelect).toEqual(
      caregiverRelationshipQueryInternals.invitationManagementSelect,
    );
    expect(caregiverRelationshipQueryInternals.caregiverRelationshipManagementSelect).toEqual(
      caregiverRelationshipQueryInternals.relationshipManagementSelect,
    );
    const serialized = JSON.stringify([
      caregiverRelationshipQueryInternals.caregiverInvitationManagementSelect,
      caregiverRelationshipQueryInternals.caregiverRelationshipManagementSelect,
    ]);
    expect(serialized).not.toMatch(/givenName|familyName|identityKeyHash|national.?id|hospitalNumber|emergencyContact|authSubject|appointment|screening|goalPlan|followup/i);
  });
});
