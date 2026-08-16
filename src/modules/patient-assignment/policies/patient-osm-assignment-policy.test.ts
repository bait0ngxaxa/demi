import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  assertPatientOsmAssignmentPolicy,
  decidePatientOsmAssignmentPolicy,
  PATIENT_ASSIGN_OSM_CAPABILITY,
} from "./patient-osm-assignment-policy";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";

function ownerActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "33333333-3333-4333-8333-333333333333",
    personId: "44444444-4444-4444-8444-444444444444",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId: hospitalA,
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

describe("patient:assign-osm policy", () => {
  it("allows an active Hospital OWNER in the same Hospital", () => {
    expect(
      decidePatientOsmAssignmentPolicy({
        actor: ownerActor(),
        capability: PATIENT_ASSIGN_OSM_CAPABILITY,
        targetHospitalId: hospitalA,
      }),
    ).toEqual({ allowed: true, reason: "active_hospital_owner" });
  });

  it.each([
    ["MEMBER", MembershipType.MEMBER],
    ["inactive membership", MembershipType.OWNER],
  ] as const)("denies Hospital %s", (_label, membershipType) => {
    const actor = ownerActor({
      hospitalMemberships: [
        {
          hospitalId: hospitalA,
          membershipType,
          profession: Profession.NURSE,
          status: _label === "inactive membership" ? MembershipStatus.SUSPENDED : MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    expect(
      decidePatientOsmAssignmentPolicy({
        actor,
        capability: PATIENT_ASSIGN_OSM_CAPABILITY,
        targetHospitalId: hospitalA,
      }).allowed,
    ).toBe(false);
  });

  it.each([hospitalB])("denies a different Hospital, including hierarchy scopes", (targetHospitalId) => {
    expect(
      decidePatientOsmAssignmentPolicy({
        actor: ownerActor(),
        capability: PATIENT_ASSIGN_OSM_CAPABILITY,
        targetHospitalId,
      }),
    ).toEqual({ allowed: false, reason: "active_owner_membership_required" });
  });

  it.each([
    ["OSM", [Role.OSM], []],
    ["ADMIN", [Role.ADMIN], []],
  ] as const)("denies %s assignment authority", (_label, roles, hospitalMemberships) => {
    expect(
      decidePatientOsmAssignmentPolicy({
        actor: ownerActor({ roles, hospitalMemberships }),
        capability: PATIENT_ASSIGN_OSM_CAPABILITY,
        targetHospitalId: hospitalA,
      }).allowed,
    ).toBe(false);
  });

  it("denies an inactive Hospital", () => {
    expect(
      decidePatientOsmAssignmentPolicy({
        actor: ownerActor({
          hospitalMemberships: [
            {
              hospitalId: hospitalA,
              membershipType: MembershipType.OWNER,
              profession: null,
              status: MembershipStatus.ACTIVE,
              hospitalStatus: HospitalStatus.SUSPENDED,
            },
          ],
        }),
        capability: PATIENT_ASSIGN_OSM_CAPABILITY,
        targetHospitalId: hospitalA,
      }),
    ).toEqual({ allowed: false, reason: "active_hospital_required" });
  });

  it("uses the same fail-closed assertion boundary", () => {
    expect(() =>
      assertPatientOsmAssignmentPolicy({
        actor: ownerActor(),
        capability: PATIENT_ASSIGN_OSM_CAPABILITY,
        targetHospitalId: hospitalB,
      }),
    ).toThrow();
  });
});
