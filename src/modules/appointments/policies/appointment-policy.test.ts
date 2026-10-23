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
  APPOINTMENT_HOME_VISIT_MANAGE_CAPABILITY,
  APPOINTMENT_REQUEST_RESCHEDULE_CAPABILITY,
  APPOINTMENT_ACKNOWLEDGE_CAPABILITY,
  APPOINTMENT_ACCEPT_ASSIGNMENT_CAPABILITY,
  APPOINTMENT_CREATE_CAPABILITY,
  APPOINTMENT_MANAGE_CAPABILITY,
  APPOINTMENT_RECORD_COORDINATION_CAPABILITY,
  APPOINTMENT_READ_CAPABILITY,
  APPOINTMENT_REQUEST_CANCEL_CAPABILITY,
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
    assignedOsmAssignmentId: null,
    patientUserId: "55555555-5555-4555-8555-555555555555",
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
  it("evaluates each Hospital membership independently for a multi-role actor", () => {
    const membership = actor().hospitalMemberships[0];
    if (!membership) throw new Error("Missing membership fixture");
    const multiRole = actor({
      roles: [Role.ADMIN, Role.HOSPITAL, Role.PATIENT],
      hospitalMemberships: [membership, { ...membership, hospitalId: hospitalB, membershipType: MembershipType.MEMBER }],
    });
    for (const hospitalId of [hospitalA, hospitalB]) {
      expect(decideAppointmentPolicy({ actor: multiRole, target: target({ hospitalId }), capability: APPOINTMENT_MANAGE_CAPABILITY }).allowed).toBe(true);
    }
    expect(decideAppointmentPolicy({ actor: multiRole, target: target({ hospitalId: "another-hospital" }), capability: APPOINTMENT_MANAGE_CAPABILITY }).allowed).toBe(false);
    expect(decideAppointmentPolicy({
      actor: { ...multiRole, hospitalMemberships: [membership, { ...membership, hospitalId: hospitalB, status: MembershipStatus.SUSPENDED }] },
      target: target({ hospitalId: hospitalB }), capability: APPOINTMENT_MANAGE_CAPABILITY,
    }).allowed).toBe(false);
  });
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
        capability: APPOINTMENT_CREATE_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId, locationType: "HOME_VISIT", responsibleUserId: null }),
      }).allowed,
    ).toBe(true);
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

  it.each([Role.PATIENT, Role.ADMIN, Role.CAREGIVER])("denies routine %s access", (role) => {
    expect(
      decideAppointmentPolicy({
        actor: actor({ roles: [role], hospitalMemberships: [], osmHospitalRelationships: [] }),
        capability: APPOINTMENT_READ_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
  });

  it("allows Patient SELF acknowledgement and cancellation requests only for the linked Patient user", () => {
    const patientId = "55555555-5555-4555-8555-555555555555";
    const patient = actor({ userId: patientId, roles: [Role.PATIENT], hospitalMemberships: [] });
    const otherPatient = actor({ roles: [Role.PATIENT], hospitalMemberships: [] });

    for (const capability of [APPOINTMENT_ACKNOWLEDGE_CAPABILITY, APPOINTMENT_REQUEST_CANCEL_CAPABILITY]) {
      expect(decideAppointmentPolicy({ actor: patient, capability, target: target({ patientUserId: patientId }) }))
        .toMatchObject({ allowed: true, reason: "patient_self_scope" });
      expect(decideAppointmentPolicy({ actor: otherPatient, capability, target: target({ patientUserId: patientId }) }).allowed)
        .toBe(false);
    }
  });

  it.each([
    "appointment:reschedule",
    "appointment:cancel",
    "appointment:complete",
    "appointment:no-show",
  ])("does not add unsupported capability %s", (capability) => {
    expect(decideAppointmentPolicy({ actor: actor(), capability, target: target() })).toMatchObject({
      allowed: false,
      reason: "invalid_capability",
    });
  });

  it("allows a Hospital/Patient multi-role user to use normal direct Work authority on their own appointment", () => {
    const patientId = "55555555-5555-4555-8555-555555555555";
    const multiRoleActor = actor({ userId: patientId, roles: [Role.HOSPITAL, Role.PATIENT] });
    const ownTarget = target({ patientUserId: patientId });

    expect(decideAppointmentPolicy({
      actor: multiRoleActor,
      capability: APPOINTMENT_MANAGE_CAPABILITY,
      target: ownTarget,
    })).toMatchObject({ allowed: true, reason: "active_direct_hospital_scope" });
    expect(decideAppointmentPolicy({
      actor: multiRoleActor,
      capability: APPOINTMENT_ACKNOWLEDGE_CAPABILITY,
      target: ownTarget,
    })).toMatchObject({ allowed: true, reason: "patient_self_scope" });
  });

  it("allows only exact assigned OSM to create, proxy, and record coordination", () => {
    const osm = actor({
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [{
        hospitalId: hospitalA,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      }],
    });

    for (const capability of [
      APPOINTMENT_CREATE_CAPABILITY,
      APPOINTMENT_ACKNOWLEDGE_CAPABILITY,
      APPOINTMENT_ACCEPT_ASSIGNMENT_CAPABILITY,
      APPOINTMENT_REQUEST_CANCEL_CAPABILITY,
      APPOINTMENT_RECORD_COORDINATION_CAPABILITY,
    ]) {
      expect(decideAppointmentPolicy({
        actor: osm,
        capability,
        target: target({ assignedOsmUserId: actorUserId, locationType: "HOME_VISIT", responsibleUserId: null, assignedOsmAssignmentId: "66666666-6666-4666-8666-666666666666" }),
      })).toMatchObject({ allowed: true, reason: "active_osm_assignment_scope" });
    }

    expect(decideAppointmentPolicy({
      actor: osm,
      capability: APPOINTMENT_RECORD_COORDINATION_CAPABILITY,
      target: target(),
    }).allowed).toBe(false);

    for (const capability of [
      APPOINTMENT_CREATE_CAPABILITY,
      APPOINTMENT_ACKNOWLEDGE_CAPABILITY,
      APPOINTMENT_ACCEPT_ASSIGNMENT_CAPABILITY,
      APPOINTMENT_REQUEST_CANCEL_CAPABILITY,
      APPOINTMENT_RECORD_COORDINATION_CAPABILITY,
    ]) {
      expect(decideAppointmentPolicy({ actor: osm, capability, target: target() }).allowed).toBe(false);
      expect(decideAppointmentPolicy({
        actor: osm,
        capability,
        target: target({ hospitalId: hospitalB, assignedOsmUserId: actorUserId }),
      }).allowed).toBe(false);
    }
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

describe("OSM home-visit authority", () => {
  const osm = actor({ roles: [Role.OSM], hospitalMemberships: [], osmHospitalRelationships: [
    { hospitalId: hospitalA, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
  ] });
  const home = target({ assignedOsmUserId: actorUserId, assignedOsmAssignmentId: "assignment", locationType: "HOME_VISIT", createdByUserId: actorUserId, responsibleUserId: null, operation: "EDIT" });
  it("allows the current assigned OSM to edit and cancel their own home visit", () => {
    for (const operation of ["EDIT", "CANCEL"] as const) {
      expect(decideAppointmentPolicy({ actor: osm, capability: APPOINTMENT_HOME_VISIT_MANAGE_CAPABILITY, target: { ...home, operation } }).allowed).toBe(true);
    }
  });
  it.each([
    [{ assignedOsmUserId: "other" }, "active_osm_assignment_scope_required"],
    [{ assignedOsmUserId: null }, "active_osm_assignment_scope_required"],
    [{ locationType: "CLINIC" }, "osm_home_location_required"],
    [{ locationType: "ONLINE" }, "osm_home_location_required"],
    [{ locationType: "OTHER" }, "osm_home_location_required"],
    [{ locationType: null }, "osm_home_location_required"],
    [{ createdByUserId: "other" }, "osm_creator_required"],
    [{ createdByUserId: undefined }, "osm_creator_required"],
    [{ responsibleUserId: "clinician" }, "osm_responsible_must_be_null"],
    [{ operation: "COMPLETE" }, "osm_terminal_action_not_allowed"],
    [{ operation: "NO_SHOW" }, "osm_terminal_action_not_allowed"],
    [{ hospitalStatus: HospitalStatus.SUSPENDED }, "inactive_target_hospital"],
  ] as const)("denies invalid home-visit scope %j", (patch, reason) => {
    expect(decideAppointmentPolicy({ actor: osm, capability: APPOINTMENT_HOME_VISIT_MANAGE_CAPABILITY, target: { ...home, ...patch } })).toEqual({ allowed: false, reason });
  });
  it.each([MembershipStatus.ENDED, MembershipStatus.SUSPENDED, MembershipStatus.PROVISIONED, MembershipStatus.INVITED])("denies OSM relationship %s", (status) => {
    expect(decideAppointmentPolicy({ actor: { ...osm, osmHospitalRelationships: [{ hospitalId: hospitalA, status, hospitalStatus: HospitalStatus.ACTIVE }] }, capability: APPOINTMENT_HOME_VISIT_MANAGE_CAPABILITY, target: home }).allowed).toBe(false);
  });
  it("allows SELF and assigned OSM reschedule requests, denies unassigned OSM", () => {
    expect(decideAppointmentPolicy({ actor: osm, target: home, capability: APPOINTMENT_REQUEST_RESCHEDULE_CAPABILITY }).allowed).toBe(true);
    expect(decideAppointmentPolicy({ actor: osm, target: target(), capability: APPOINTMENT_REQUEST_RESCHEDULE_CAPABILITY }).allowed).toBe(false);
    expect(decideAppointmentPolicy({ actor: actor({ roles: [Role.PATIENT] }), target: target({ patientUserId: actorUserId }), capability: APPOINTMENT_REQUEST_RESCHEDULE_CAPABILITY }).allowed).toBe(true);
  });
});
