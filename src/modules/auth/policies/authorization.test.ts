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
    ...overrides,
  };
}

describe("authorization kernel", () => {
  it("allows an explicit capability and active hospital scope", () => {
    const decision = decidePolicy({
      actor: createActor(),
      capability: "patient.read",
      requiredRole: Role.OSM,
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
        capability: "patient.read",
        requiredRole: Role.OSM,
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
      capability: "governance.review",
      requiredRole: Role.ADMIN,
      scope: { kind: "GLOBAL" },
    });
    const hospitalDecision = decidePolicy({
      actor: owner,
      capability: "hospital.manage",
      requiredRole: Role.HOSPITAL,
      scope: { kind: "HOSPITAL", hospitalId: "hospital-a" },
    });

    expect(adminDecision.allowed).toBe(false);
    expect(hospitalDecision.allowed).toBe(true);
  });

  it("fails closed for missing actors, unknown capabilities, and unresolved scopes", () => {
    expect(
      decidePolicy({
        actor: null,
        capability: "patient.read",
        requiredRole: Role.PATIENT,
        scope: { kind: "SELF", personId: "person-1" },
      }).allowed,
    ).toBe(false);

    expect(
      decidePolicy({
        actor: createActor(),
        capability: "",
        requiredRole: Role.PATIENT,
        scope: { kind: "SELF", personId: "person-1" },
      }).allowed,
    ).toBe(false);

    expect(
      decidePolicy({
        actor: createActor(),
        capability: "patient.read",
        requiredRole: Role.PATIENT,
        scope: { kind: "DENIED" },
      }).allowed,
    ).toBe(false);

    expect(
      decidePolicy({
        actor: createActor(),
        capability: "patient.read",
        requiredRole: Role.PATIENT,
        scope: undefined,
      }).allowed,
    ).toBe(false);
  });

  it("denies inactive membership or inactive hospital scope", () => {
    const actor = createActor({
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
      capability: "patient.read",
      requiredRole: Role.OSM,
      scope: { kind: "HOSPITAL", hospitalId: "hospital-a" },
    });

    expect(decision).toEqual({ allowed: false, reason: "hospital_membership_not_active" });
  });
});
