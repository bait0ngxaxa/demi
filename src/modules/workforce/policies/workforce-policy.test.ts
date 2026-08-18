import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  assertWorkforcePolicy,
  decideWorkforcePolicy,
  WORKFORCE_CAPABILITIES,
} from "./workforce-policy";

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

describe("workforce policy", () => {
  it("allows an ACTIVE Hospital Owner for a direct ACTIVE Hospital", () => {
    expect(
      decideWorkforcePolicy({
        actor: createActor(),
        capability: WORKFORCE_CAPABILITIES.create,
        targetHospitalId: hospitalId,
      }),
    ).toEqual({ allowed: true, reason: "active_hospital_owner" });
  });

  it.each([
    WORKFORCE_CAPABILITIES.update,
    WORKFORCE_CAPABILITIES.suspend,
    WORKFORCE_CAPABILITIES.restore,
  ])("applies the direct active Owner boundary to %s", (capability) => {
    expect(
      decideWorkforcePolicy({
        actor: createActor(),
        capability,
        targetHospitalId: hospitalId,
      }),
    ).toEqual({ allowed: true, reason: "active_hospital_owner" });
  });

  it.each([
    ["ordinary member", MembershipType.MEMBER, MembershipStatus.ACTIVE, HospitalStatus.ACTIVE],
    ["inactive membership", MembershipType.OWNER, MembershipStatus.SUSPENDED, HospitalStatus.ACTIVE],
    ["inactive Hospital", MembershipType.OWNER, MembershipStatus.ACTIVE, HospitalStatus.SUSPENDED],
  ])("denies %s", (_label, membershipType, status, hospitalStatus) => {
    expect(
      decideWorkforcePolicy({
        actor: createActor({
          hospitalMemberships: [
            {
              hospitalId,
              membershipType,
              profession: null,
              status,
              hospitalStatus,
            },
          ],
        }),
        capability: WORKFORCE_CAPABILITIES.create,
        targetHospitalId: hospitalId,
      }).allowed,
    ).toBe(false);
  });

  it("denies Platform ADMIN, wrong Hospital and unknown capability", () => {
    expect(
      decideWorkforcePolicy({
        actor: createActor({ roles: [Role.ADMIN] }),
        capability: WORKFORCE_CAPABILITIES.create,
        targetHospitalId: hospitalId,
      }).allowed,
    ).toBe(false);
    expect(
      decideWorkforcePolicy({
        actor: createActor(),
        capability: WORKFORCE_CAPABILITIES.create,
        targetHospitalId: "44444444-4444-4444-8444-444444444444",
      }).allowed,
    ).toBe(false);
    expect(
      decideWorkforcePolicy({
        actor: createActor(),
        capability: "role:assign",
        targetHospitalId: hospitalId,
      }).allowed,
    ).toBe(false);
  });

  it("fails closed for a missing actor", () => {
    expect(() =>
      assertWorkforcePolicy({
        actor: null,
        capability: WORKFORCE_CAPABILITIES.osmProvision,
        targetHospitalId: hospitalId,
      }),
    ).toThrow();
  });
});
