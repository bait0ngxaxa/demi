import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  PROGRAM_REPORT_READ_CAPABILITY,
  assertProgramReportPolicy,
  decideProgramReportPolicy,
} from "./program-report-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";

function target(
  overrides: Partial<Parameters<typeof decideProgramReportPolicy>[0]["target"]> = {},
): Parameters<typeof decideProgramReportPolicy>[0]["target"] {
  return {
    hospitalId,
    hospitalStatus: HospitalStatus.ACTIVE,
    assignedOsmUserId: null,
    ...overrides,
  };
}

function hospitalActor(membershipType: MembershipType): ActorContext {
  return {
    userId: actorUserId,
    personId: "33333333-3333-4333-8333-333333333333",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
  };
}

function osmActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: actorUserId,
    personId: "33333333-3333-4333-8333-333333333333",
    roles: [Role.OSM],
    hospitalMemberships: [],
    osmHospitalRelationships: [
      {
        hospitalId,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    ...overrides,
  };
}

describe("Program reporting policy", () => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])(
    "allows an active direct HOSPITAL %s scope",
    (membershipType) => {
      expect(
        decideProgramReportPolicy({
          actor: hospitalActor(membershipType),
          capability: PROGRAM_REPORT_READ_CAPABILITY,
          target: target(),
        }),
      ).toMatchObject({ allowed: true, reason: "active_direct_hospital_scope" });
    },
  );

  it("allows an OSM with the exact active Patient assignment", () => {
    expect(
      decideProgramReportPolicy({
        actor: osmActor(),
        capability: PROGRAM_REPORT_READ_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: true, reason: "active_osm_assignment_scope" });
  });

  it("denies an unassigned or ended-assignment OSM", () => {
    expect(
      decideProgramReportPolicy({
        actor: osmActor(),
        capability: PROGRAM_REPORT_READ_CAPABILITY,
        target: target(),
      }),
    ).toMatchObject({ allowed: false, reason: "active_osm_assignment_scope_required" });
  });

  it("denies an inactive OSM-Hospital relationship", () => {
    expect(
      decideProgramReportPolicy({
        actor: osmActor({
          osmHospitalRelationships: [
            {
              hospitalId,
              status: MembershipStatus.SUSPENDED,
              hospitalStatus: HospitalStatus.ACTIVE,
            },
          ],
        }),
        capability: PROGRAM_REPORT_READ_CAPABILITY,
        target: target({ assignedOsmUserId: actorUserId }),
      }),
    ).toMatchObject({ allowed: false, reason: "active_osm_assignment_scope_required" });
  });

  it("denies inactive Hospital membership and inactive Hospital", () => {
    expect(
      decideProgramReportPolicy({
        actor: {
          ...hospitalActor(MembershipType.MEMBER),
          hospitalMemberships: [
            {
              hospitalId,
              membershipType: MembershipType.MEMBER,
              profession: null,
              status: MembershipStatus.SUSPENDED,
              hospitalStatus: HospitalStatus.ACTIVE,
            },
          ],
        },
        capability: PROGRAM_REPORT_READ_CAPABILITY,
        target: target(),
      }),
    ).toMatchObject({ allowed: false, reason: "active_direct_hospital_scope_required" });

    expect(
      decideProgramReportPolicy({
        actor: hospitalActor(MembershipType.OWNER),
        capability: PROGRAM_REPORT_READ_CAPABILITY,
        target: target({ hospitalStatus: HospitalStatus.SUSPENDED }),
      }),
    ).toMatchObject({ allowed: false, reason: "inactive_target_hospital" });
  });

  it.each([Role.ADMIN, Role.PATIENT])("denies %s-only access", (role) => {
    expect(
      decideProgramReportPolicy({
        actor: {
          ...hospitalActor(MembershipType.MEMBER),
          roles: [role],
          hospitalMemberships: [],
        },
        capability: PROGRAM_REPORT_READ_CAPABILITY,
        target: target(),
      }),
    ).toMatchObject({ allowed: false, reason: "program_role_required" });
  });

  it("denies an unknown report capability", () => {
    expect(
      decideProgramReportPolicy({
        actor: hospitalActor(MembershipType.MEMBER),
        capability: "program:read",
        target: target(),
      }),
    ).toEqual({ allowed: false, reason: "invalid_capability" });
  });

  it("asserts the dedicated capability using the same exact Program scope", () => {
    expect(() =>
      assertProgramReportPolicy({
        actor: hospitalActor(MembershipType.OWNER),
        capability: PROGRAM_REPORT_READ_CAPABILITY,
        target: target(),
      }),
    ).not.toThrow();
  });
});
