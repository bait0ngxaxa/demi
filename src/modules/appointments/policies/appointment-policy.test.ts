import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Profession,
  Role,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  APPOINTMENT_MANAGE_CAPABILITY,
  APPOINTMENT_READ_CAPABILITY,
  decideAppointmentPolicy,
} from "./appointment-policy";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

function target(overrides: Partial<Parameters<typeof decideAppointmentPolicy>[0]["target"]> = {}) {
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
        profession: Profession.DOCTOR,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

describe("Appointment policy", () => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])(
    "allows active direct Hospital %s to read and manage",
    (membershipType) => {
      const currentActor = actor({
        hospitalMemberships: [{ ...actor().hospitalMemberships[0], membershipType }],
      });

      expect(
        decideAppointmentPolicy({
          actor: currentActor,
          capability: APPOINTMENT_READ_CAPABILITY,
          target: target(),
        }).allowed,
      ).toBe(true);
      expect(
        decideAppointmentPolicy({
          actor: currentActor,
          capability: APPOINTMENT_MANAGE_CAPABILITY,
          target: target(),
        }).allowed,
      ).toBe(true);
    },
  );

  it("keeps profession neutral", () => {
    for (const profession of [Profession.DOCTOR, Profession.NURSE, Profession.COORDINATOR, Profession.OTHER]) {
      expect(
        decideAppointmentPolicy({
          actor: actor({ hospitalMemberships: [{ ...actor().hospitalMemberships[0], profession }] }),
          capability: APPOINTMENT_MANAGE_CAPABILITY,
          target: target(),
        }).allowed,
      ).toBe(true);
    }
  });

  it.each([
    ["wrong Hospital", actor(), target({ hospitalId: hospitalB })],
    [
      "inactive membership",
      actor({
        hospitalMemberships: [{ ...actor().hospitalMemberships[0], status: MembershipStatus.SUSPENDED }],
      }),
      target(),
    ],
    ["inactive Hospital", actor(), target({ hospitalStatus: HospitalStatus.SUSPENDED })],
  ] as const)("denies %s", (_label, currentActor, currentTarget) => {
    expect(
      decideAppointmentPolicy({
        actor: currentActor,
        capability: APPOINTMENT_READ_CAPABILITY,
        target: currentTarget,
      }).allowed,
    ).toBe(false);
  });

  it("allows OSM read only for the exact active assignment", () => {
    const osm = actor({
      userId: actorUserId,
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
      decideAppointmentPolicy({
        actor: osm,
        capability: APPOINTMENT_READ_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: true, reason: "active_osm_assignment_scope" });
    expect(
      decideAppointmentPolicy({
        actor: osm,
        capability: APPOINTMENT_MANAGE_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: false, reason: "osm_manage_not_allowed" });
    expect(
      decideAppointmentPolicy({
        actor: osm,
        capability: APPOINTMENT_READ_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
    expect(
      decideAppointmentPolicy({
        actor: osm,
        capability: APPOINTMENT_READ_CAPABILITY,
        target: target({ hospitalId: hospitalB, assignedOsmUserId: actorUserId }),
      }).allowed,
    ).toBe(false);
  });

  it.each([Role.PATIENT, Role.ADMIN])("denies routine %s access", (role) => {
    expect(
      decideAppointmentPolicy({
        actor: actor({ roles: [role], hospitalMemberships: [], osmHospitalRelationships: [] }),
        capability: APPOINTMENT_READ_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
  });

  it("evaluates a multi-role ADMIN through valid direct Hospital scope", () => {
    const adminWithHospitalScope: ActorContext = {
      ...actor(),
      roles: [Role.ADMIN, Role.HOSPITAL],
    };

    expect(
      decideAppointmentPolicy({
        actor: adminWithHospitalScope,
        capability: APPOINTMENT_READ_CAPABILITY,
        target: target(),
      }),
    ).toMatchObject({ allowed: true, reason: "active_direct_hospital_scope" });
    expect(
      decideAppointmentPolicy({
        actor: adminWithHospitalScope,
        capability: APPOINTMENT_MANAGE_CAPABILITY,
        target: target(),
      }),
    ).toMatchObject({ allowed: true, reason: "active_direct_hospital_scope" });
  });

  it("allows multi-role ADMIN read through exact OSM assignment but not manage", () => {
    const adminWithOsmScope: ActorContext = {
      ...actor(),
      roles: [Role.ADMIN, Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId: hospitalA,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    };

    expect(
      decideAppointmentPolicy({
        actor: adminWithOsmScope,
        capability: APPOINTMENT_READ_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: true, reason: "active_osm_assignment_scope" });
    expect(
      decideAppointmentPolicy({
        actor: adminWithOsmScope,
        capability: APPOINTMENT_MANAGE_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: false, reason: "osm_manage_not_allowed" });
  });
});
