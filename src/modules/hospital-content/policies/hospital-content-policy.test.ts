import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import { decideHospitalContentPolicy, HOSPITAL_CONTENT_CAPABILITIES } from "./hospital-content-policy";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "33333333-3333-4333-8333-333333333333",
    personId: "44444444-4444-4444-8444-444444444444",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [{
      hospitalId: hospitalA,
      membershipType: MembershipType.OWNER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    }],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

describe("Hospital Content direct Owner policy", () => {
  it("allows read/manage only for an exact direct active Owner scope", () => {
    expect(decideHospitalContentPolicy({ actor: actor(), capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: hospitalA }).allowed).toBe(true);
    expect(decideHospitalContentPolicy({ actor: actor(), capability: HOSPITAL_CONTENT_CAPABILITIES.manage, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: hospitalA }).allowed).toBe(true);
    expect(decideHospitalContentPolicy({ actor: actor(), capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: hospitalB }).allowed).toBe(false);
  });

  it("does not accept capability alone, Contact capabilities, generic approval or a different scope", () => {
    for (const capability of ["hospital-content:manage", "hospital-contact:update", "hospital:approve", "hospital-content:delete"]) {
      expect(decideHospitalContentPolicy({ actor: actor(), capability, scope: undefined, hospitalId: hospitalA }).allowed).toBe(false);
    }
    expect(decideHospitalContentPolicy({ actor: actor(), capability: "hospital-contact:update", scope: "DIRECT_HOSPITAL_OWNER", hospitalId: hospitalA }).allowed).toBe(false);
  });

  it.each([
    ["MEMBER", MembershipType.MEMBER, MembershipStatus.ACTIVE, HospitalStatus.ACTIVE],
    ["suspended membership", MembershipType.OWNER, MembershipStatus.SUSPENDED, HospitalStatus.ACTIVE],
    ["inactive Hospital", MembershipType.OWNER, MembershipStatus.ACTIVE, HospitalStatus.SUSPENDED],
  ] as const)("denies %s", (_label, membershipType, status, hospitalStatus) => {
    const denied = actor({ hospitalMemberships: [{ hospitalId: hospitalA, membershipType, profession: null, status, hospitalStatus }] });
    expect(decideHospitalContentPolicy({ actor: denied, capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: hospitalA }).allowed).toBe(false);
  });

  it("does not grant hierarchy, OSM, Patient or ADMIN-only authority", () => {
    expect(decideHospitalContentPolicy({ actor: actor({ roles: [Role.ADMIN], hospitalMemberships: [] }), capability: HOSPITAL_CONTENT_CAPABILITIES.manage, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: hospitalA }).allowed).toBe(false);
    expect(decideHospitalContentPolicy({ actor: actor({ roles: [Role.OSM], hospitalMemberships: [] }), capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: hospitalA }).allowed).toBe(false);
    expect(decideHospitalContentPolicy({ actor: actor({ roles: [Role.PATIENT], hospitalMemberships: [] }), capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: hospitalA }).allowed).toBe(false);
    expect(decideHospitalContentPolicy({ actor: actor({ roles: [Role.HOSPITAL], hospitalMemberships: [] }), capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: hospitalB }).allowed).toBe(false);
    expect(decideHospitalContentPolicy({ actor: null, capability: HOSPITAL_CONTENT_CAPABILITIES.manage, scope: "DIRECT_HOSPITAL_OWNER" }).allowed).toBe(false);
  });
});

describe("Hospital Content Patient read scope", () => {
  const decide = (context: ActorContext | null, capability: string = HOSPITAL_CONTENT_CAPABILITIES.read) => decideHospitalContentPolicy({ actor: context, capability, scope: "PATIENT_SELF_RELATIONSHIP" });
  it("allows PATIENT read but never Patient manage", () => {
    const patient = actor({ roles: [Role.PATIENT], hospitalMemberships: [] });
    expect(decide(patient).allowed).toBe(true);
    expect(decide(patient, HOSPITAL_CONTENT_CAPABILITIES.manage).allowed).toBe(false);
  });
  it("denies missing actor/identity and capability-only inputs", () => {
    expect(decide(null).allowed).toBe(false);
    expect(decide(actor({ roles: [Role.PATIENT], userId: "" })).allowed).toBe(false);
    expect(decide(actor({ roles: [Role.PATIENT], personId: " " })).allowed).toBe(false);
    expect(decideHospitalContentPolicy({ actor: actor({ roles: [Role.PATIENT] }), capability: HOSPITAL_CONTENT_CAPABILITIES.read, scope: undefined }).allowed).toBe(false);
  });
  it.each([Role.HOSPITAL, Role.OSM, Role.ADMIN])("denies %s regardless of Owner membership/profession/other relationships", (role) => {
    expect(decide(actor({ roles: [role] })).allowed).toBe(false);
  });
  it("keeps multi-role Patient and Publisher scopes separate", () => {
    const multi = actor({ roles: [Role.PATIENT, Role.HOSPITAL] });
    expect(decide(multi).scope).toBe("PATIENT_SELF_RELATIONSHIP");
    expect(decide(multi, HOSPITAL_CONTENT_CAPABILITIES.manage).allowed).toBe(false);
    expect(decideHospitalContentPolicy({ actor: multi, capability: HOSPITAL_CONTENT_CAPABILITIES.manage, scope: "DIRECT_HOSPITAL_OWNER", hospitalId: hospitalA }).allowed).toBe(true);
  });
});
