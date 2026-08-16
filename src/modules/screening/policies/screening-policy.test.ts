import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decideScreeningPolicy,
  SCREENING_READ_CAPABILITY,
  SCREENING_SUBMIT_CAPABILITY,
} from "./screening-policy";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";
const osmUserId = "33333333-3333-4333-8333-333333333333";

function target(overrides: Partial<Parameters<typeof decideScreeningPolicy>[0]["target"]> = {}) {
  return {
    hospitalId: hospitalA,
    hospitalStatus: HospitalStatus.ACTIVE,
    assignedOsmUserId: null,
    ...overrides,
  };
}

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "44444444-4444-4444-8444-444444444444",
    personId: "55555555-5555-4555-8555-555555555555",
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

describe("Screening policy", () => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])(
    "allows an active Hospital %s in the exact Hospital",
    (membershipType) => {
      expect(
        decideScreeningPolicy({
          actor: actor({
            hospitalMemberships: [
              {
                ...actor().hospitalMemberships[0],
                membershipType,
              },
            ],
          }),
          capability: SCREENING_SUBMIT_CAPABILITY,
          target: target(),
        }).allowed,
      ).toBe(true);
    },
  );

  it("does not let profession change Hospital authority", () => {
    for (const profession of [Profession.DOCTOR, Profession.NURSE, Profession.COORDINATOR, Profession.OTHER]) {
      expect(
        decideScreeningPolicy({
          actor: actor({
            hospitalMemberships: [{ ...actor().hospitalMemberships[0], profession }],
          }),
          capability: SCREENING_READ_CAPABILITY,
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
        hospitalMemberships: [
          { ...actor().hospitalMemberships[0], status: MembershipStatus.SUSPENDED },
        ],
      }),
      target(),
    ],
    ["inactive Hospital", actor(), target({ hospitalStatus: HospitalStatus.SUSPENDED })],
  ] as const)("denies %s", (_label, currentActor, currentTarget) => {
    expect(
      decideScreeningPolicy({
        actor: currentActor,
        capability: SCREENING_READ_CAPABILITY,
        target: currentTarget,
      }).allowed,
    ).toBe(false);
  });

  it("allows an OSM only for the exact active assignment and Hospital relationship", () => {
    const osm = actor({
      userId: osmUserId,
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
      decideScreeningPolicy({
        actor: osm,
        capability: SCREENING_SUBMIT_CAPABILITY,
        target: target({ assignedOsmUserId: osmUserId }),
      }).allowed,
    ).toBe(true);
    expect(
      decideScreeningPolicy({
        actor: osm,
        capability: SCREENING_READ_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
  });

  it.each([Role.PATIENT, Role.ADMIN])("denies routine %s Screening operation", (role) => {
    expect(
      decideScreeningPolicy({
        actor: actor({ roles: [role], hospitalMemberships: [], osmHospitalRelationships: [] }),
        capability: SCREENING_READ_CAPABILITY,
        target: target(),
      }).allowed,
    ).toBe(false);
  });
});
