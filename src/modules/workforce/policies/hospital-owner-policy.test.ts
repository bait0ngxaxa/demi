import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  assertHospitalOwnerPolicy,
  decideHospitalOwnerPolicy,
  HOSPITAL_OWNER_CAPABILITIES,
} from "./hospital-owner-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function createActor(overrides: Partial<ActorContext> = {}): ActorContext {
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

describe("Hospital Owner policy", () => {
  it("allows an exact active Hospital Owner for each bounded capability", () => {
    for (const capability of Object.values(HOSPITAL_OWNER_CAPABILITIES)) {
      expect(
        decideHospitalOwnerPolicy({
          actor: createActor(),
          capability,
          targetHospitalId: hospitalId,
        }),
      ).toEqual({ allowed: true, reason: "active_hospital_owner" });
    }
  });

  it("allows an ADMIN only when the same actor independently has the Owner relationship", () => {
    expect(
      decideHospitalOwnerPolicy({
        actor: createActor({ roles: [Role.ADMIN, Role.HOSPITAL] }),
        capability: HOSPITAL_OWNER_CAPABILITIES.promote,
        targetHospitalId: hospitalId,
      }),
    ).toEqual({ allowed: true, reason: "active_hospital_owner" });
  });

  it.each([
    ["missing actor", null, HOSPITAL_OWNER_CAPABILITIES.readGovernance, hospitalId],
    ["member", createActor({ hospitalMemberships: [{
      hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    }] }), HOSPITAL_OWNER_CAPABILITIES.promote, hospitalId],
    ["OSM", createActor({ roles: [Role.OSM], hospitalMemberships: [] }), HOSPITAL_OWNER_CAPABILITIES.demote, hospitalId],
    ["PATIENT", createActor({ roles: [Role.PATIENT], hospitalMemberships: [] }), HOSPITAL_OWNER_CAPABILITIES.demote, hospitalId],
    ["ADMIN only", createActor({ roles: [Role.ADMIN], hospitalMemberships: [] }), HOSPITAL_OWNER_CAPABILITIES.promote, hospitalId],
    ["inactive membership", createActor({ hospitalMemberships: [{
      hospitalId,
      membershipType: MembershipType.OWNER,
      profession: null,
      status: MembershipStatus.SUSPENDED,
      hospitalStatus: HospitalStatus.ACTIVE,
    }] }), HOSPITAL_OWNER_CAPABILITIES.readGovernance, hospitalId],
    ["inactive Hospital", createActor({ hospitalMemberships: [{
      hospitalId,
      membershipType: MembershipType.OWNER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.SUSPENDED,
    }] }), HOSPITAL_OWNER_CAPABILITIES.readGovernance, hospitalId],
    ["hierarchy-only scope", createActor({ hospitalMemberships: [] }), HOSPITAL_OWNER_CAPABILITIES.readGovernance, hospitalId],
  ] as const)("denies %s", (_label, actor, capability, targetHospitalId) => {
    expect(
      decideHospitalOwnerPolicy({ actor, capability, targetHospitalId }),
    ).toMatchObject({ allowed: false });
  });

  it("denies unrelated Hospital scope and invalid capabilities", () => {
    expect(
      decideHospitalOwnerPolicy({
        actor: createActor(),
        capability: HOSPITAL_OWNER_CAPABILITIES.readGovernance,
        targetHospitalId: "44444444-4444-4444-8444-444444444444",
      }),
    ).toEqual({ allowed: false, reason: "active_owner_membership_required" });
    expect(
      decideHospitalOwnerPolicy({
        actor: createActor(),
        capability: "membership:set-owner",
        targetHospitalId: hospitalId,
      }),
    ).toEqual({ allowed: false, reason: "invalid_capability" });
  });

  it("fails closed through the assertion helper", () => {
    expect(() =>
      assertHospitalOwnerPolicy({
        actor: null,
        capability: HOSPITAL_OWNER_CAPABILITIES.promote,
        targetHospitalId: hospitalId,
      }),
    ).toThrow();
  });
});
