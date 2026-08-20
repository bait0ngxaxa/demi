import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  PATIENT_PROGRAM_MANAGE_CAPABILITY,
  PATIENT_PROGRAM_READ_CAPABILITY,
  decidePatientProgramPolicy,
} from "./patient-program-policy";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

function target(
  overrides: Partial<Parameters<typeof decidePatientProgramPolicy>[0]["target"]> = {},
): Parameters<typeof decidePatientProgramPolicy>[0]["target"] {
  return {
    hospitalId: hospitalA,
    hospitalStatus: HospitalStatus.ACTIVE,
    assignedOsmUserId: null,
    ...overrides,
  };
}

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: actorUserId,
    personId: "44444444-4444-4444-8444-444444444444",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId: hospitalA,
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

describe("Patient Program policy", () => {
  it.each([PATIENT_PROGRAM_READ_CAPABILITY, PATIENT_PROGRAM_MANAGE_CAPABILITY])(
    "allows an active direct Hospital actor to %s",
    (capability) => {
      expect(
        decidePatientProgramPolicy({ actor: actor(), capability, target: target() }),
      ).toMatchObject({ allowed: true, reason: "active_direct_hospital_scope" });
    },
  );

  it("denies a Hospital actor outside the exact Hospital scope", () => {
    expect(
      decidePatientProgramPolicy({
        actor: actor(),
        capability: PATIENT_PROGRAM_READ_CAPABILITY,
        target: target({ hospitalId: hospitalB }),
      }),
    ).toMatchObject({ allowed: false, reason: "active_direct_hospital_scope_required" });
  });

  it("allows only the exact active OSM assignment", () => {
    const osmActor = actor({
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId: hospitalA,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    expect(
      decidePatientProgramPolicy({
        actor: osmActor,
        capability: PATIENT_PROGRAM_MANAGE_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: true, reason: "active_osm_assignment_scope" });
    expect(
      decidePatientProgramPolicy({
        actor: osmActor,
        capability: PATIENT_PROGRAM_READ_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientProgramPolicy({
        actor: osmActor,
        capability: PATIENT_PROGRAM_READ_CAPABILITY,
        target: target({ hospitalId: hospitalB, assignedOsmUserId: actorUserId }),
      }).allowed,
    ).toBe(false);
  });

  it.each([Role.ADMIN, Role.PATIENT])("denies %s without a care-actor scope", (role) => {
    expect(
      decidePatientProgramPolicy({
        actor: actor({ roles: [role], hospitalMemberships: [], osmHospitalRelationships: [] }),
        capability: PATIENT_PROGRAM_READ_CAPABILITY,
        target: target(),
      }),
    ).toMatchObject({ allowed: false, reason: "program_role_required" });
  });

  it("preserves a valid scoped path for a multi-role ADMIN actor", () => {
    expect(
      decidePatientProgramPolicy({
        actor: actor({ roles: [Role.ADMIN, Role.HOSPITAL] }),
        capability: PATIENT_PROGRAM_MANAGE_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(true);
  });

  it("denies inactive relationship scope", () => {
    expect(
      decidePatientProgramPolicy({
        actor: actor(),
        capability: PATIENT_PROGRAM_READ_CAPABILITY,
        target: target({ hospitalStatus: HospitalStatus.SUSPENDED }),
      }),
    ).toMatchObject({ allowed: false, reason: "inactive_target_hospital" });
  });
});
