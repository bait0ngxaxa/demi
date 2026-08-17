import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  PATIENT_BASELINE_CREATE_CAPABILITY,
  PATIENT_BASELINE_READ_CAPABILITY,
  decidePatientBaselinePolicy,
} from "./patient-baseline-policy";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

function target(overrides: Partial<Parameters<typeof decidePatientBaselinePolicy>[0]["target"]> = {}) {
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

describe("Patient Baseline policy", () => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])(
    "allows active direct Hospital %s to read and create",
    (membershipType) => {
      const currentActor = actor({
        hospitalMemberships: [{ ...actor().hospitalMemberships[0], membershipType }],
      });

      expect(
        decidePatientBaselinePolicy({
          actor: currentActor,
          capability: PATIENT_BASELINE_READ_CAPABILITY,
          target: target(),
        }),
      ).toMatchObject({ allowed: true, reason: "active_direct_hospital_scope" });
      expect(
        decidePatientBaselinePolicy({
          actor: currentActor,
          capability: PATIENT_BASELINE_CREATE_CAPABILITY,
          target: target(),
        }),
      ).toMatchObject({ allowed: true, reason: "active_direct_hospital_scope" });
    },
  );

  it("allows only the exact active OSM assignment", () => {
    const osm = actor({
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
      decidePatientBaselinePolicy({
        actor: osm,
        capability: PATIENT_BASELINE_CREATE_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: true, reason: "active_osm_assignment_scope" });
    expect(
      decidePatientBaselinePolicy({
        actor: osm,
        capability: PATIENT_BASELINE_CREATE_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientBaselinePolicy({
        actor: osm,
        capability: PATIENT_BASELINE_CREATE_CAPABILITY,
        target: target({ assignedOsmUserId: "55555555-5555-4555-8555-555555555555" }),
      }).allowed,
    ).toBe(false);
  });

  it("denies ADMIN-only, inactive scope, and Hospital hierarchy widening", () => {
    expect(
      decidePatientBaselinePolicy({
        actor: actor({ roles: [Role.ADMIN], hospitalMemberships: [] }),
        capability: PATIENT_BASELINE_CREATE_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientBaselinePolicy({
        actor: actor({
          hospitalMemberships: [
            { ...actor().hospitalMemberships[0], status: MembershipStatus.SUSPENDED },
          ],
        }),
        capability: PATIENT_BASELINE_CREATE_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientBaselinePolicy({
        actor: actor(),
        capability: PATIENT_BASELINE_READ_CAPABILITY,
        target: target({ hospitalId: hospitalB }),
      }).allowed,
    ).toBe(false);
  });

  it("preserves a valid scoped path for multi-role ADMIN actors", () => {
    const directHospitalActor = actor({ roles: [Role.ADMIN, Role.HOSPITAL] });
    expect(
      decidePatientBaselinePolicy({
        actor: directHospitalActor,
        capability: PATIENT_BASELINE_CREATE_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(true);

    const osmActor = actor({
      roles: [Role.ADMIN, Role.OSM],
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
      decidePatientBaselinePolicy({
        actor: osmActor,
        capability: PATIENT_BASELINE_CREATE_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }).allowed,
    ).toBe(true);
  });
});
