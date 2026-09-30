import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import { decideAccountRecoveryIssuePolicy } from "./account-recovery-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType: MembershipType.OWNER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

describe("assisted account recovery issuer policy", () => {
  it("allows only an active direct Owner of the exact active Hospital", () => {
    expect(decideAccountRecoveryIssuePolicy(actor(), hospitalId).allowed).toBe(true);
    expect(decideAccountRecoveryIssuePolicy(actor(), "44444444-4444-4444-8444-444444444444").allowed)
      .toBe(false);
  });

  it.each([
    ["Hospital MEMBER", actor({ hospitalMemberships: [{
      hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: "NURSE",
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    }] })],
    ["OSM", actor({ roles: [Role.OSM], hospitalMemberships: [] })],
    ["ADMIN", actor({ roles: [Role.ADMIN], hospitalMemberships: [] })],
    ["inactive membership", actor({ hospitalMemberships: [{
      hospitalId,
      membershipType: MembershipType.OWNER,
      profession: null,
      status: MembershipStatus.SUSPENDED,
      hospitalStatus: HospitalStatus.ACTIVE,
    }] })],
    ["inactive Hospital", actor({ hospitalMemberships: [{
      hospitalId,
      membershipType: MembershipType.OWNER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.SUSPENDED,
    }] })],
  ] as const)("denies %s", (_label, candidate) => {
    expect(decideAccountRecoveryIssuePolicy(candidate, hospitalId).allowed).toBe(false);
  });
});
