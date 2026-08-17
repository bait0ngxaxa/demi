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
  FOLLOWUP_READ_CAPABILITY,
  FOLLOWUP_RECORD_CAPABILITY,
  decideFollowupPolicy,
} from "./followup-policy";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

function target(overrides: Partial<Parameters<typeof decideFollowupPolicy>[0]["target"]> = {}) {
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

describe("Follow-up policy", () => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])(
    "allows active direct Hospital %s to read and record",
    (membershipType) => {
      const currentActor = actor({
        hospitalMemberships: [{ ...actor().hospitalMemberships[0], membershipType }],
      });

      expect(
        decideFollowupPolicy({
          actor: currentActor,
          capability: FOLLOWUP_READ_CAPABILITY,
          target: target(),
        }).allowed,
      ).toBe(true);
      expect(
        decideFollowupPolicy({
          actor: currentActor,
          capability: FOLLOWUP_RECORD_CAPABILITY,
          target: target(),
        }).allowed,
      ).toBe(true);
    },
  );

  it("keeps profession neutral", () => {
    for (const profession of [Profession.DOCTOR, Profession.NURSE, Profession.COORDINATOR, Profession.OTHER]) {
      expect(
        decideFollowupPolicy({
          actor: actor({
            hospitalMemberships: [{ ...actor().hospitalMemberships[0], profession }],
          }),
          capability: FOLLOWUP_RECORD_CAPABILITY,
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
      decideFollowupPolicy({
        actor: currentActor,
        capability: FOLLOWUP_READ_CAPABILITY,
        target: currentTarget,
      }).allowed,
    ).toBe(false);
  });

  it("allows an exact active OSM assignment to read and record", () => {
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
      decideFollowupPolicy({
        actor: osm,
        capability: FOLLOWUP_READ_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: true, reason: "active_osm_assignment_scope" });
    expect(
      decideFollowupPolicy({
        actor: osm,
        capability: FOLLOWUP_RECORD_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: true, reason: "active_osm_assignment_scope" });
    expect(
      decideFollowupPolicy({
        actor: osm,
        capability: FOLLOWUP_READ_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
  });

  it("does not widen OSM access through a Hospital relationship or hierarchy", () => {
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
      decideFollowupPolicy({
        actor: osm,
        capability: FOLLOWUP_READ_CAPABILITY,
        target: target({ hospitalId: hospitalB, assignedOsmUserId: actorUserId }),
      }).allowed,
    ).toBe(false);
  });

  it.each([Role.PATIENT, Role.ADMIN])("denies routine %s access", (role) => {
    expect(
      decideFollowupPolicy({
        actor: actor({ roles: [role], hospitalMemberships: [], osmHospitalRelationships: [] }),
        capability: FOLLOWUP_READ_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
    expect(
      decideFollowupPolicy({
        actor: actor({ roles: [role], hospitalMemberships: [], osmHospitalRelationships: [] }),
        capability: FOLLOWUP_RECORD_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
  });

  it("evaluates a multi-role ADMIN through valid direct Hospital scope", () => {
    const adminWithHospitalScope = actor({ roles: [Role.ADMIN, Role.HOSPITAL] });

    expect(
      decideFollowupPolicy({
        actor: adminWithHospitalScope,
        capability: FOLLOWUP_READ_CAPABILITY,
        target: target(),
      }),
    ).toMatchObject({ allowed: true, reason: "active_direct_hospital_scope" });
    expect(
      decideFollowupPolicy({
        actor: adminWithHospitalScope,
        capability: FOLLOWUP_RECORD_CAPABILITY,
        target: target(),
      }),
    ).toMatchObject({ allowed: true, reason: "active_direct_hospital_scope" });
  });

  it("evaluates a multi-role ADMIN through exact active OSM assignment", () => {
    const adminWithOsmScope = actor({
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
      decideFollowupPolicy({
        actor: adminWithOsmScope,
        capability: FOLLOWUP_READ_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: true, reason: "active_osm_assignment_scope" });
    expect(
      decideFollowupPolicy({
        actor: adminWithOsmScope,
        capability: FOLLOWUP_RECORD_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: true, reason: "active_osm_assignment_scope" });
  });
});
