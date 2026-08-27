import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decidePatientClassificationPolicy,
  PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
  PATIENT_CLASSIFICATION_READ_CAPABILITY,
} from "./patient-classification-policy";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

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

function target(overrides: Partial<Parameters<typeof decidePatientClassificationPolicy>[0]["target"]> = {}) {
  return {
    hospitalId: hospitalA,
    hospitalStatus: HospitalStatus.ACTIVE,
    assignedOsmUserId: null,
    patientRelationshipExists: true,
    ...overrides,
  };
}

describe("Patient classification policy", () => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])(
    "allows active Hospital %s to manage a related Patient",
    (membershipType) => {
      const currentActor = actor({
        hospitalMemberships: [{ ...actor().hospitalMemberships[0], membershipType }],
      });

      expect(
        decidePatientClassificationPolicy({
          actor: currentActor,
          capability: PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
          target: target(),
        }),
      ).toEqual({ allowed: true, reason: "active_direct_hospital_scope" });
    },
  );

  it("allows an exact active OSM assignment to read but never manage", () => {
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
      decidePatientClassificationPolicy({
        actor: osmActor,
        capability: PATIENT_CLASSIFICATION_READ_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: true, reason: "active_osm_read_scope" });
    expect(
      decidePatientClassificationPolicy({
        actor: osmActor,
        capability: PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientClassificationPolicy({
        actor: osmActor,
        capability: PATIENT_CLASSIFICATION_READ_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
  });

  it("denies ADMIN-only actors, missing Patient relationships, inactive memberships, and inactive Hospitals", () => {
    expect(
      decidePatientClassificationPolicy({
        actor: actor({ roles: [Role.ADMIN], hospitalMemberships: [] }),
        capability: PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientClassificationPolicy({
        actor: actor({
          hospitalMemberships: [
            { ...actor().hospitalMemberships[0], status: MembershipStatus.SUSPENDED },
          ],
        }),
        capability: PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientClassificationPolicy({
        actor: actor(),
        capability: PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
        target: target({ patientRelationshipExists: false }),
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientClassificationPolicy({
        actor: actor(),
        capability: PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
        target: target({ hospitalStatus: HospitalStatus.SUSPENDED }),
      }).allowed,
    ).toBe(false);
  });

  it("does not widen an active membership to another Hospital", () => {
    expect(
      decidePatientClassificationPolicy({
        actor: actor(),
        capability: PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
        target: target({ hospitalId: hospitalB }),
      }).allowed,
    ).toBe(false);
  });

  it("keeps a valid direct Hospital path for a multi-role actor", () => {
    expect(
      decidePatientClassificationPolicy({
        actor: actor({ roles: [Role.ADMIN, Role.HOSPITAL, Role.OSM] }),
        capability: PATIENT_CLASSIFICATION_MANAGE_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(true);
  });
});
