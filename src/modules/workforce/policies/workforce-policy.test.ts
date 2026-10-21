import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  assertWorkforcePolicy,
  decideWorkforcePolicy,
  WORKFORCE_CAPABILITIES,
} from "./workforce-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function createActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
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

describe("workforce policy", () => {
  it("allows an ACTIVE Hospital Owner for a direct ACTIVE Hospital", () => {
    expect(
      decideWorkforcePolicy({
        actor: createActor(),
        capability: WORKFORCE_CAPABILITIES.create,
        targetHospitalId: hospitalId,
      }),
    ).toEqual({ allowed: true, reason: "active_hospital_owner" });
  });

  it.each([
    WORKFORCE_CAPABILITIES.update,
    WORKFORCE_CAPABILITIES.suspend,
    WORKFORCE_CAPABILITIES.restore,
  ])("applies the direct active Owner boundary to %s", (capability) => {
    expect(
      decideWorkforcePolicy({
        actor: createActor(),
        capability,
        targetHospitalId: hospitalId,
      }),
    ).toEqual({ allowed: true, reason: "active_hospital_owner" });
  });

  it.each([WORKFORCE_CAPABILITIES.osmSuspend, WORKFORCE_CAPABILITIES.osmRestore])(
    "allows an exact active Hospital Owner for OSM lifecycle capability %s",
    (capability) => {
      expect(
        decideWorkforcePolicy({
          actor: createActor(),
          capability,
          targetHospitalId: hospitalId,
        }),
      ).toEqual({ allowed: true, reason: "active_hospital_owner" });
    },
  );

  it.each([
    ["ordinary member", MembershipType.MEMBER, MembershipStatus.ACTIVE, HospitalStatus.ACTIVE],
    ["inactive membership", MembershipType.OWNER, MembershipStatus.SUSPENDED, HospitalStatus.ACTIVE],
    ["inactive Hospital", MembershipType.OWNER, MembershipStatus.ACTIVE, HospitalStatus.SUSPENDED],
  ])("denies %s", (_label, membershipType, status, hospitalStatus) => {
    expect(
      decideWorkforcePolicy({
        actor: createActor({
          hospitalMemberships: [
            {
              hospitalId,
              membershipType,
              profession: null,
              status,
              hospitalStatus,
            },
          ],
        }),
        capability: WORKFORCE_CAPABILITIES.create,
        targetHospitalId: hospitalId,
      }).allowed,
    ).toBe(false);
  });

  it("denies Platform ADMIN, wrong Hospital and unknown capability", () => {
    expect(
      decideWorkforcePolicy({
        actor: createActor({ roles: [Role.ADMIN] }),
        capability: WORKFORCE_CAPABILITIES.create,
        targetHospitalId: hospitalId,
      }).allowed,
    ).toBe(false);
    expect(
      decideWorkforcePolicy({
        actor: createActor(),
        capability: WORKFORCE_CAPABILITIES.create,
        targetHospitalId: "44444444-4444-4444-8444-444444444444",
      }).allowed,
    ).toBe(false);
    expect(
      decideWorkforcePolicy({
        actor: createActor(),
        capability: "role:assign",
        targetHospitalId: hospitalId,
      }).allowed,
    ).toBe(false);
  });

  it("denies OSM lifecycle capability without an exact active Owner membership", () => {
    const deniedActors: ActorContext[] = [
      createActor({ roles: [] }),
      createActor({ roles: [Role.OSM] }),
      createActor({ roles: [Role.PATIENT] }),
      createActor({ roles: [Role.ADMIN] }),
      createActor({
        hospitalMemberships: [
          {
            hospitalId,
            membershipType: MembershipType.MEMBER,
            profession: null,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ],
      }),
      createActor({
        hospitalMemberships: [
          {
            hospitalId,
            membershipType: MembershipType.OWNER,
            profession: null,
            status: MembershipStatus.SUSPENDED,
            hospitalStatus: HospitalStatus.ACTIVE,
          },
        ],
      }),
      createActor({
        hospitalMemberships: [
          {
            hospitalId,
            membershipType: MembershipType.OWNER,
            profession: null,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.SUSPENDED,
          },
        ],
      }),
    ];

    for (const capability of [WORKFORCE_CAPABILITIES.osmSuspend, WORKFORCE_CAPABILITIES.osmRestore]) {
      for (const actor of deniedActors) {
        expect(
          decideWorkforcePolicy({
            actor,
            capability,
            targetHospitalId: hospitalId,
          }).allowed,
        ).toBe(false);
      }
    }

    for (const capability of [WORKFORCE_CAPABILITIES.osmSuspend, WORKFORCE_CAPABILITIES.osmRestore]) {
      expect(
        decideWorkforcePolicy({
          actor: createActor(),
          capability,
          targetHospitalId: "44444444-4444-4444-8444-444444444444",
        }).allowed,
      ).toBe(false);
    }
  });

  it.each([WORKFORCE_CAPABILITIES.osmSuspend, WORKFORCE_CAPABILITIES.osmRestore])(
    "fails closed for a missing actor for %s",
    (capability) => {
      expect(() =>
        assertWorkforcePolicy({
          actor: null,
          capability,
          targetHospitalId: hospitalId,
        }),
      ).toThrow();
    },
  );
});

describe("workforce policy: ACTIVE MEMBER OSM access (ADR-0008 amendment D1)", () => {
  function memberActor(
    overrides: { status?: MembershipStatus; hospitalStatus?: HospitalStatus; hospital?: string } = {},
  ) {
    return createActor({
      hospitalMemberships: [
        {
          hospitalId: overrides.hospital ?? hospitalId,
          membershipType: MembershipType.MEMBER,
          profession: null,
          status: overrides.status ?? MembershipStatus.ACTIVE,
          hospitalStatus: overrides.hospitalStatus ?? HospitalStatus.ACTIVE,
        },
      ],
    });
  }

  it.each([WORKFORCE_CAPABILITIES.osmProvision, WORKFORCE_CAPABILITIES.osmRead])(
    "denies an ACTIVE direct MEMBER for %s",
    (capability) => {
      expect(
        decideWorkforcePolicy({ actor: memberActor(), capability, targetHospitalId: hospitalId }),
      ).toEqual({ allowed: false, reason: "active_owner_membership_required" });
    },
  );

  it.each([
    WORKFORCE_CAPABILITIES.read,
    WORKFORCE_CAPABILITIES.create,
    WORKFORCE_CAPABILITIES.update,
    WORKFORCE_CAPABILITIES.suspend,
    WORKFORCE_CAPABILITIES.restore,
    WORKFORCE_CAPABILITIES.osmSuspend,
    WORKFORCE_CAPABILITIES.osmRestore,
    WORKFORCE_CAPABILITIES.activationRevoke,
  ])("keeps %s OWNER-only for a MEMBER", (capability) => {
    expect(
      decideWorkforcePolicy({ actor: memberActor(), capability, targetHospitalId: hospitalId })
        .allowed,
    ).toBe(false);
    expect(
      decideWorkforcePolicy({ actor: createActor(), capability, targetHospitalId: hospitalId })
        .allowed,
    ).toBe(true);
  });

  it.each([
    ["inactive membership", memberActor({ status: MembershipStatus.SUSPENDED })],
    ["inactive Hospital", memberActor({ hospitalStatus: HospitalStatus.SUSPENDED })],
    ["another Hospital", memberActor({ hospital: "44444444-4444-4444-8444-444444444444" })],
    ["no HOSPITAL role", createActor({ ...memberActor(), roles: [Role.OSM] })],
  ])("denies a MEMBER with %s", (_label, actor) => {
    expect(
      decideWorkforcePolicy({
        actor,
        capability: WORKFORCE_CAPABILITIES.osmProvision,
        targetHospitalId: hospitalId,
      }).allowed,
    ).toBe(false);
  });

  it("does not let an OSM relationship alone provision OSM", () => {
    expect(
      decideWorkforcePolicy({
        actor: createActor({
          roles: [Role.HOSPITAL],
          hospitalMemberships: [],
          osmHospitalRelationships: [
            { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
          ],
        }),
        capability: WORKFORCE_CAPABILITIES.osmProvision,
        targetHospitalId: hospitalId,
      }).allowed,
    ).toBe(false);
  });
});
