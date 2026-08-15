import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  assertPatientBulkProvisioningPolicy,
  assertPatientProvisioningPolicy,
  decidePatientProvisioningPolicy,
  PATIENT_PROVISIONING_CAPABILITY,
} from "./patient-provisioning-policy";

function hospitalActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    personId: "00000000-0000-4000-8000-000000000002",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId: "00000000-0000-4000-8000-000000000010",
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

describe("patient provisioning policy", () => {
  it("allows direct active Hospital scope without inspecting profession or requiring OWNER", () => {
    expect(
      decidePatientProvisioningPolicy({
        actor: hospitalActor(),
        capability: PATIENT_PROVISIONING_CAPABILITY,
        targetHospitalId: "00000000-0000-4000-8000-000000000010",
      }),
    ).toEqual({ allowed: true, reason: "active_direct_hospital_scope" });
  });

  it("allows an active OSM-Hospital relationship for single provisioning", () => {
    const actor = hospitalActor({
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId: "00000000-0000-4000-8000-000000000010",
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    expect(
      decidePatientProvisioningPolicy({
        actor,
        capability: PATIENT_PROVISIONING_CAPABILITY,
        targetHospitalId: "00000000-0000-4000-8000-000000000010",
      }),
    ).toEqual({ allowed: true, reason: "active_osm_hospital_scope" });
  });

  it("denies inactive relationships and an OSM bulk import scope", () => {
    const actor = hospitalActor({
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId: "00000000-0000-4000-8000-000000000010",
          status: MembershipStatus.SUSPENDED,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    expect(
      decidePatientProvisioningPolicy({
        actor,
        capability: PATIENT_PROVISIONING_CAPABILITY,
        targetHospitalId: "00000000-0000-4000-8000-000000000010",
      }),
    ).toMatchObject({ allowed: false });
    expect(() =>
      assertPatientBulkProvisioningPolicy({
        actor: hospitalActor({
          roles: [Role.OSM],
          hospitalMemberships: [],
          osmHospitalRelationships: [
            {
              hospitalId: "00000000-0000-4000-8000-000000000010",
              status: MembershipStatus.ACTIVE,
              hospitalStatus: HospitalStatus.ACTIVE,
            },
          ],
        }),
        capability: PATIENT_PROVISIONING_CAPABILITY,
        targetHospitalId: "00000000-0000-4000-8000-000000000010",
      }),
    ).toThrow();
  });

  it("asserts the same capability boundary used by the service", () => {
    expect(() =>
      assertPatientProvisioningPolicy({
        actor: hospitalActor(),
        capability: PATIENT_PROVISIONING_CAPABILITY,
        targetHospitalId: "00000000-0000-4000-8000-000000000010",
      }),
    ).not.toThrow();
  });
});
