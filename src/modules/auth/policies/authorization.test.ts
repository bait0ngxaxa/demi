import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "../types/actor-context";
import { decidePolicy } from "./authorization";

function createActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "user-1",
    personId: "person-1",
    roles: [Role.OSM, Role.PATIENT],
    hospitalMemberships: [
      {
        hospitalId: "hospital-a",
        membershipType: MembershipType.MEMBER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

describe("authorization kernel", () => {
  it("allows a hospital role with an active hospital scope", () => {
    const decision = decidePolicy({
      actor: createActor({ roles: [Role.HOSPITAL] }),
      requiredRole: Role.HOSPITAL,
      scope: { kind: "HOSPITAL", hospitalId: "hospital-a" },
    });

    expect(decision).toEqual({ allowed: true, reason: "allowed" });
  });

  it("represents multiple roles without changing the Person/User identity", () => {
    const actor = createActor();

    expect(actor.roles).toEqual([Role.OSM, Role.PATIENT]);
    expect(actor.userId).toBe("user-1");
    expect(actor.personId).toBe("person-1");
  });

  it("represents multiple hospital memberships for one User", () => {
    const actor = createActor({
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        ...createActor().hospitalMemberships,
        {
          hospitalId: "hospital-b",
          membershipType: MembershipType.MEMBER,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    expect(actor.hospitalMemberships.map(({ hospitalId }) => hospitalId)).toEqual([
      "hospital-a",
      "hospital-b",
    ]);
    expect(
      decidePolicy({
        actor,
        requiredRole: Role.HOSPITAL,
        scope: { kind: "HOSPITAL", hospitalId: "hospital-b" },
      }).allowed,
    ).toBe(true);
  });

  it("keeps a hospital owner out of the platform ADMIN role", () => {
    const owner = createActor({
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: "hospital-a",
          membershipType: MembershipType.OWNER,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    const adminDecision = decidePolicy({
      actor: owner,
      requiredRole: Role.ADMIN,
      scope: { kind: "GLOBAL" },
    });
    const hospitalDecision = decidePolicy({
      actor: owner,
      requiredRole: Role.HOSPITAL,
      scope: { kind: "HOSPITAL", hospitalId: "hospital-a" },
    });

    expect(adminDecision.allowed).toBe(false);
    expect(hospitalDecision.allowed).toBe(true);
  });

  it("fails closed for missing actors and unresolved authorization input", () => {
    expect(
      decidePolicy({
        actor: null,
        requiredRole: Role.PATIENT,
        scope: { kind: "SELF", personId: "person-1" },
      }).allowed,
    ).toBe(false);

    expect(
      decidePolicy({
        actor: createActor(),
        requiredRole: "NOT_A_ROLE",
        scope: { kind: "SELF", personId: "person-1" },
      }).allowed,
    ).toBe(false);

    expect(
      decidePolicy({
        actor: createActor(),
        requiredRole: Role.PATIENT,
        scope: { kind: "DENIED" },
      }).allowed,
    ).toBe(false);

    expect(
      decidePolicy({
        actor: createActor(),
        requiredRole: Role.PATIENT,
        scope: undefined,
      }).allowed,
    ).toBe(false);
  });

  it("denies inactive membership or inactive hospital scope", () => {
    const actor = createActor({
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: "hospital-a",
          membershipType: MembershipType.MEMBER,
          profession: null,
          status: MembershipStatus.INVITED,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    const decision = decidePolicy({
      actor,
      requiredRole: Role.HOSPITAL,
      scope: { kind: "HOSPITAL", hospitalId: "hospital-a" },
    });

    expect(decision).toEqual({ allowed: false, reason: "hospital_membership_not_active" });
  });

  it("denies an inactive hospital, a wrong hospital, and a mismatched SELF scope", () => {
    const inactiveHospitalActor = createActor({
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: "hospital-a",
          membershipType: MembershipType.MEMBER,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.SUSPENDED,
        },
      ],
    });

    expect(
      decidePolicy({
        actor: inactiveHospitalActor,
        requiredRole: Role.HOSPITAL,
        scope: { kind: "HOSPITAL", hospitalId: "hospital-a" },
      }),
    ).toEqual({ allowed: false, reason: "hospital_not_active" });

    expect(
      decidePolicy({
        actor: createActor({ roles: [Role.HOSPITAL] }),
        requiredRole: Role.HOSPITAL,
        scope: { kind: "HOSPITAL", hospitalId: "hospital-missing" },
      }),
    ).toEqual({ allowed: false, reason: "hospital_membership_not_active" });

    expect(
      decidePolicy({
        actor: createActor(),
        requiredRole: Role.PATIENT,
        scope: { kind: "SELF", personId: "another-person" },
      }),
    ).toEqual({ allowed: false, reason: "self_scope_mismatch" });
  });
});
