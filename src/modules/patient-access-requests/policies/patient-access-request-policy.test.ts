import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decidePatientAccessRequestPolicy,
  PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY,
} from "./patient-access-request-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function actor(
  roles: Role[],
  membershipType?: MembershipType,
  membershipHospitalId: string = hospitalId,
  membershipStatus: MembershipStatus = MembershipStatus.ACTIVE,
  hospitalStatus: HospitalStatus = HospitalStatus.ACTIVE,
): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles,
    hospitalMemberships: membershipType
      ? [{
          hospitalId: membershipHospitalId,
          membershipType,
          profession: null,
          status: membershipStatus,
          hospitalStatus,
        }]
      : [],
    osmHospitalRelationships: [],
  };
}

describe("Patient access request review policy", () => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])(
    "allows active direct Hospital %s membership for its exact active Hospital",
    (membershipType) => {
      expect(
        decidePatientAccessRequestPolicy({
          actor: actor([Role.HOSPITAL], membershipType),
          capability: PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY,
          hospitalId,
        }).allowed,
      ).toBe(true);
    },
  );

  it.each([
    ["Patient", actor([Role.PATIENT], MembershipType.OWNER)],
    ["OSM", actor([Role.OSM], MembershipType.OWNER)],
    ["Platform ADMIN", actor([Role.ADMIN], MembershipType.OWNER)],
    ["ADMIN with Hospital role", actor([Role.ADMIN, Role.HOSPITAL], MembershipType.OWNER)],
    ["unrelated Hospital", actor([Role.HOSPITAL], MembershipType.OWNER, "44444444-4444-4444-8444-444444444444")],
    ["inactive membership", actor([Role.HOSPITAL], MembershipType.MEMBER, hospitalId, MembershipStatus.SUSPENDED)],
    ["inactive Hospital", actor([Role.HOSPITAL], MembershipType.OWNER, hospitalId, MembershipStatus.ACTIVE, HospitalStatus.SUSPENDED)],
  ] as const)("denies %s", (_label, candidate) => {
    expect(
      decidePatientAccessRequestPolicy({
        actor: candidate,
        capability: PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY,
        hospitalId,
      }).allowed,
    ).toBe(false);
  });
});
