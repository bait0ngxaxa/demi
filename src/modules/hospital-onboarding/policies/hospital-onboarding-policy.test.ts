import { MembershipStatus, MembershipType, HospitalStatus, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  assertHospitalOnboardingCapability,
  decideHospitalOnboardingPolicy,
  HOSPITAL_ONBOARDING_CAPABILITIES,
} from "./hospital-onboarding-policy";

function actor(roles: Role[]): ActorContext {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    roles,
    hospitalMemberships: [
      {
        hospitalId: "33333333-3333-4333-8333-333333333333",
        membershipType: MembershipType.OWNER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
  };
}

describe("hospital onboarding policy", () => {
  it("allows only the public admission capability without an actor", () => {
    expect(
      decideHospitalOnboardingPolicy({
        actor: null,
        capability: HOSPITAL_ONBOARDING_CAPABILITIES.onboard,
      }),
    ).toEqual({ allowed: true, reason: "public_admission" });
    expect(
      decideHospitalOnboardingPolicy({
        actor: null,
        capability: HOSPITAL_ONBOARDING_CAPABILITIES.review,
      }).allowed,
    ).toBe(false);
  });

  it("requires an ADMIN role for review, approve, and reject", () => {
    for (const capability of [
      HOSPITAL_ONBOARDING_CAPABILITIES.review,
      HOSPITAL_ONBOARDING_CAPABILITIES.approve,
      HOSPITAL_ONBOARDING_CAPABILITIES.reject,
    ]) {
      expect(
        decideHospitalOnboardingPolicy({ actor: actor([Role.HOSPITAL]), capability }).allowed,
      ).toBe(false);
      expect(
        decideHospitalOnboardingPolicy({ actor: actor([Role.ADMIN]), capability }),
      ).toEqual({ allowed: true, reason: "platform_admin" });
    }
  });

  it("does not grant platform review authority to a hospital owner", () => {
    expect(() =>
      assertHospitalOnboardingCapability(
        actor([Role.HOSPITAL]),
        HOSPITAL_ONBOARDING_CAPABILITIES.approve,
      ),
    ).toThrow();
  });
});
