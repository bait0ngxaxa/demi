import { MembershipStatus, MembershipType, HospitalStatus, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  assertHospitalGovernanceCapability,
  decideHospitalGovernancePolicy,
  HOSPITAL_GOVERNANCE_CAPABILITIES,
} from "./hospital-governance-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function actor(roles: Role[]): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles,
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
  };
}

describe("hospital governance policy", () => {
  it("allows all governance capabilities for a Platform ADMIN actor", () => {
    for (const capability of Object.values(HOSPITAL_GOVERNANCE_CAPABILITIES)) {
      expect(decideHospitalGovernancePolicy({ actor: actor([Role.ADMIN]), capability })).toEqual({
        allowed: true,
        reason: "active_platform_admin",
      });
    }
  });

  it.each([Role.HOSPITAL, Role.OSM, Role.PATIENT])(
    "denies %s without the Platform ADMIN role",
    (role) => {
      expect(
        decideHospitalGovernancePolicy({
          actor: actor([role]),
          capability: HOSPITAL_GOVERNANCE_CAPABILITIES.suspend,
        }),
      ).toEqual({ allowed: false, reason: "platform_admin_required" });
    },
  );

  it("does not derive governance authority from a Hospital Owner relationship or hierarchy", () => {
    expect(
      decideHospitalGovernancePolicy({
        actor: actor([Role.HOSPITAL]),
        capability: HOSPITAL_GOVERNANCE_CAPABILITIES.restore,
      }).allowed,
    ).toBe(false);
    expect(
      decideHospitalGovernancePolicy({ actor: actor([]), capability: "hospital:suspend" }).allowed,
    ).toBe(false);
  });

  it("fails closed for a missing actor or unknown capability", () => {
    expect(
      decideHospitalGovernancePolicy({
        actor: null,
        capability: HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance,
      }),
    ).toEqual({ allowed: false, reason: "missing_actor" });
    expect(
      decideHospitalGovernancePolicy({ actor: actor([Role.ADMIN]), capability: "hospital:delete" }),
    ).toEqual({ allowed: false, reason: "invalid_capability" });
  });

  it("asserts the same server-side boundary", () => {
    expect(() =>
      assertHospitalGovernanceCapability(
        actor([Role.HOSPITAL]),
        HOSPITAL_GOVERNANCE_CAPABILITIES.suspend,
      ),
    ).toThrow();
  });
});
