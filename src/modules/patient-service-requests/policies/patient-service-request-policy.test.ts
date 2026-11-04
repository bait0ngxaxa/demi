import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decidePatientServiceRequestPolicy,
  PATIENT_SERVICE_REQUEST_CAPABILITIES,
} from "./patient-service-request-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function actor(roles: Role[], membershipType?: MembershipType): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles,
    hospitalMemberships: membershipType
      ? [{
          hospitalId,
          membershipType,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        }]
      : [],
    osmHospitalRelationships: [],
  };
}

describe("Patient service request policy", () => {
  it("allows Patient SELF request, read, and withdrawal capabilities", () => {
    for (const capability of [
      PATIENT_SERVICE_REQUEST_CAPABILITIES.create,
      PATIENT_SERVICE_REQUEST_CAPABILITIES.readSelf,
      PATIENT_SERVICE_REQUEST_CAPABILITIES.withdrawSelf,
    ]) {
      expect(decidePatientServiceRequestPolicy({ actor: actor([Role.PATIENT]), capability }).allowed).toBe(true);
    }
  });

  it("has no capability for switching a patient service on or off (ADR-0029)", () => {
    expect(Object.values(PATIENT_SERVICE_REQUEST_CAPABILITIES)).toEqual([
      "patient-service-request:create",
      "patient-service-request:read-self",
      "patient-service-request:withdraw-self",
      "patient-service-request:review",
    ]);
  });

  it.each([MembershipType.OWNER, MembershipType.MEMBER])(
    "allows direct Hospital %s to review requests",
    (membershipType) => {
      expect(
        decidePatientServiceRequestPolicy({
          actor: actor([Role.HOSPITAL], membershipType),
          capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.review,
          hospitalId,
        }).allowed,
      ).toBe(true);
    },
  );

  it.each([
    ["OSM", actor([Role.OSM], MembershipType.OWNER)],
    ["Patient", actor([Role.PATIENT], MembershipType.OWNER)],
    ["Caregiver", actor([Role.CAREGIVER], MembershipType.OWNER)],
    ["Platform ADMIN", actor([Role.ADMIN], MembershipType.OWNER)],
    ["ADMIN with Hospital role", actor([Role.ADMIN, Role.HOSPITAL], MembershipType.OWNER)],
  ] as const)("denies %s Hospital operations", (_label, candidate) => {
    expect(
      decidePatientServiceRequestPolicy({
        actor: candidate,
        capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.review,
        hospitalId,
      }).allowed,
    ).toBe(false);
  });
});
