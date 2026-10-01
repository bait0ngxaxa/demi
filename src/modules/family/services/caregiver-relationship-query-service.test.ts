import { CaregiverInvitationStatus, CaregiverRelationshipStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { caregiverRelationshipQueryInternals as queries } from "./caregiver-relationship-query-service";

const names = { givenName: true, familyName: true };
const invitationFields = { id: true, status: true, issuedAt: true, expiresAt: true };
const relationshipFields = { id: true, status: true, activatedAt: true, revokedAt: true, withdrawnAt: true };

describe("Family management query projections", () => {
  it("selects only lifecycle and caregiver names for Patient management", () => {
    const caregiverUser = { select: { person: { select: names } } };
    expect(queries.invitationManagementSelect).toEqual({ ...invitationFields, caregiverUser });
    expect(queries.relationshipManagementSelect).toEqual({ ...relationshipFields, caregiverUser });
  });

  it("selects only lifecycle and Patient names for caregiver management", () => {
    const patientProfile = { select: { person: { select: names } } };
    expect(queries.caregiverInvitationManagementSelect).toEqual({ ...invitationFields, patientProfile });
    expect(queries.caregiverRelationshipManagementSelect).toEqual({ ...relationshipFields, patientProfile });
    expect(JSON.stringify(queries)).not.toMatch(/identityKeyHash|national.?id|hospitalNumber|phone|email|address|birth|emergencyContact|authSubject|roles|memberships|hospital|appointment|screening|goalPlan|followup/i);
  });

  it("serializes only allowlisted participant names and lifecycle metadata", () => {
    const participant = { givenName: "สมหญิง", familyName: "ใจดี", identityKeyHash: "private", phone: "private" };
    const now = new Date("2026-10-01T00:00:00Z");
    expect(queries.asInvitationItem({ id: "invite", status: CaregiverInvitationStatus.PENDING, issuedAt: now, expiresAt: now }, now, participant)).toEqual({
      invitationId: "invite", status: CaregiverInvitationStatus.EXPIRED, issuedAt: now, expiresAt: now,
      participant: { givenName: "สมหญิง", familyName: "ใจดี" },
    });
    expect(queries.asRelationshipItem({ id: "relationship", status: CaregiverRelationshipStatus.ACTIVE, activatedAt: now, revokedAt: null, withdrawnAt: null }, participant)).toEqual({
      relationshipId: "relationship", status: CaregiverRelationshipStatus.ACTIVE, activatedAt: now, revokedAt: null, withdrawnAt: null,
      participant: { givenName: "สมหญิง", familyName: "ใจดี" },
    });
  });
});
