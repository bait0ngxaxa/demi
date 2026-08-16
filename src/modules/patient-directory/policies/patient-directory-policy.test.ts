import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  assertPatientReadPolicy,
  decidePatientReadPolicy,
  PATIENT_READ_CAPABILITY,
} from "./patient-directory-policy";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";
const hospitalC = "33333333-3333-4333-8333-333333333333";

function hospitalActor(
  membershipType: MembershipType = MembershipType.MEMBER,
  profession: Profession | null = null,
  overrides: Partial<ActorContext> = {},
): ActorContext {
  return {
    userId: "44444444-4444-4444-8444-444444444444",
    personId: "55555555-5555-4555-8555-555555555555",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId: hospitalA,
        membershipType,
        profession,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

describe("patient:read policy", () => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])(
    "allows an active Hospital %s in its directly related Hospital",
    (membershipType) => {
      expect(
        decidePatientReadPolicy({
          actor: hospitalActor(membershipType),
          capability: PATIENT_READ_CAPABILITY,
          targetHospitalId: hospitalA,
        }),
      ).toEqual({ allowed: true, reason: "active_direct_hospital_scope" });
    },
  );

  it("does not let profession change Patient visibility", () => {
    for (const profession of [
      Profession.DOCTOR,
      Profession.NURSE,
      Profession.COORDINATOR,
      Profession.OTHER,
      null,
    ]) {
      expect(
        decidePatientReadPolicy({
          actor: hospitalActor(MembershipType.MEMBER, profession),
          capability: PATIENT_READ_CAPABILITY,
          targetHospitalId: hospitalA,
        }).allowed,
      ).toBe(true);
    }
  });

  it.each([
    ["unrelated Hospital", hospitalB],
    ["parent Hospital", hospitalB],
    ["child Hospital", hospitalB],
    ["sibling Hospital", hospitalC],
  ])("denies a direct Hospital actor from the %s scope", (_label, targetHospitalId) => {
    expect(
      decidePatientReadPolicy({
        actor: hospitalActor(),
        capability: PATIENT_READ_CAPABILITY,
        targetHospitalId,
      }),
    ).toEqual({ allowed: false, reason: "active_direct_hospital_scope_required" });
  });

  it.each([
    ["inactive membership", { status: MembershipStatus.SUSPENDED, hospitalStatus: HospitalStatus.ACTIVE }],
    ["inactive Hospital", { status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.SUSPENDED }],
  ])("denies an actor with an %s", (_label, status) => {
    const actor = hospitalActor(
      MembershipType.MEMBER,
      null,
      {
        hospitalMemberships: [
          {
            hospitalId: hospitalA,
            membershipType: MembershipType.MEMBER,
            profession: null,
            ...status,
          },
        ],
      },
    );

    expect(
      decidePatientReadPolicy({
        actor,
        capability: PATIENT_READ_CAPABILITY,
        targetHospitalId: hospitalA,
      }).allowed,
    ).toBe(false);
  });

  it("denies OSM without the future B6.2 assignment scope", () => {
    const actor = hospitalActor(
      MembershipType.MEMBER,
      null,
      {
        roles: [Role.OSM],
        hospitalMemberships: [],
        osmHospitalRelationships: [
          {
            hospitalId: hospitalA,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ],
      },
    );

    expect(
      decidePatientReadPolicy({
        actor,
        capability: PATIENT_READ_CAPABILITY,
        targetHospitalId: hospitalA,
      }),
    ).toEqual({ allowed: false, reason: "hospital_role_required" });
  });

  it("denies Platform ADMIN routine Patient directory access", () => {
    expect(
      decidePatientReadPolicy({
        actor: hospitalActor(MembershipType.MEMBER, null, {
          roles: [Role.ADMIN],
          hospitalMemberships: [],
        }),
        capability: PATIENT_READ_CAPABILITY,
        targetHospitalId: hospitalA,
      }),
    ).toEqual({ allowed: false, reason: "hospital_role_required" });
  });

  it("fails closed for an invalid capability and missing target", () => {
    expect(
      decidePatientReadPolicy({
        actor: hospitalActor(),
        capability: "patient:update",
        targetHospitalId: hospitalA,
      }),
    ).toEqual({ allowed: false, reason: "invalid_capability" });
    expect(
      decidePatientReadPolicy({
        actor: hospitalActor(),
        capability: PATIENT_READ_CAPABILITY,
        targetHospitalId: " ",
      }),
    ).toEqual({ allowed: false, reason: "invalid_target_hospital" });
  });

  it("uses the same deny boundary for the assertion helper", () => {
    expect(() =>
      assertPatientReadPolicy({
        actor: hospitalActor(),
        capability: PATIENT_READ_CAPABILITY,
        targetHospitalId: hospitalB,
      }),
    ).toThrow();
  });
});
