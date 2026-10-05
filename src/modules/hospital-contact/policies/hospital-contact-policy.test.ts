import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decideHospitalContactPolicy,
  HOSPITAL_CONTACT_CAPABILITIES,
} from "./hospital-contact-policy";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "33333333-3333-4333-8333-333333333333",
    personId: "44444444-4444-4444-8444-444444444444",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId: hospitalA,
        membershipType: MembershipType.OWNER,
        profession: "DOCTOR",
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

describe("Hospital Contact capabilities and scopes", () => {
  it("allows direct active Hospital Owners to read and update only their exact Hospital", () => {
    const owner = actor();

    expect(
      decideHospitalContactPolicy({
        actor: owner,
        capability: HOSPITAL_CONTACT_CAPABILITIES.read,
        scope: "DIRECT_HOSPITAL_OWNER",
        hospitalId: hospitalA,
      }).allowed,
    ).toBe(true);
    expect(
      decideHospitalContactPolicy({
        actor: owner,
        capability: HOSPITAL_CONTACT_CAPABILITIES.update,
        scope: "DIRECT_HOSPITAL_OWNER",
        hospitalId: hospitalA,
      }).allowed,
    ).toBe(true);
    expect(
      decideHospitalContactPolicy({
        actor: owner,
        capability: HOSPITAL_CONTACT_CAPABILITIES.update,
        scope: "DIRECT_HOSPITAL_OWNER",
        hospitalId: hospitalB,
      }).allowed,
    ).toBe(false);
  });

  it("requires both a dedicated capability and an explicit eligible scope", () => {
    expect(
      decideHospitalContactPolicy({
        actor: actor(),
        capability: HOSPITAL_CONTACT_CAPABILITIES.read,
        scope: undefined,
        hospitalId: hospitalA,
      }).allowed,
    ).toBe(false);
    expect(
      decideHospitalContactPolicy({
        actor: actor(),
        capability: "hospital:approve",
        scope: "DIRECT_HOSPITAL_OWNER",
        hospitalId: hospitalA,
      }).allowed,
    ).toBe(false);
  });

  it.each([
    ["MEMBER", MembershipType.MEMBER, MembershipStatus.ACTIVE, HospitalStatus.ACTIVE],
    ["suspended membership", MembershipType.OWNER, MembershipStatus.SUSPENDED, HospitalStatus.ACTIVE],
    ["inactive Hospital", MembershipType.OWNER, MembershipStatus.ACTIVE, HospitalStatus.SUSPENDED],
  ] as const)("denies a direct %s scope", (_label, membershipType, status, hospitalStatus) => {
    const denied = actor({
      hospitalMemberships: [
        {
          hospitalId: hospitalA,
          membershipType,
          profession: null,
          status,
          hospitalStatus,
        },
      ],
    });

    expect(
      decideHospitalContactPolicy({
        actor: denied,
        capability: HOSPITAL_CONTACT_CAPABILITIES.read,
        scope: "DIRECT_HOSPITAL_OWNER",
        hospitalId: hospitalA,
      }).allowed,
    ).toBe(false);
  });

  it.each([[Role.ADMIN], [Role.OSM], [Role.PATIENT]] as const)(
    "denies actors with only %s authority in the Owner scope",
    (role) => {
      const denied = actor({ roles: [role], hospitalMemberships: [] });

      expect(
        decideHospitalContactPolicy({
          actor: denied,
          capability: HOSPITAL_CONTACT_CAPABILITIES.read,
          scope: "DIRECT_HOSPITAL_OWNER",
          hospitalId: hospitalA,
        }).allowed,
      ).toBe(false);
    },
  );

  it("allows an ADMIN only when the same actor also has persisted HOSPITAL Owner scope", () => {
    expect(
      decideHospitalContactPolicy({
        actor: actor({ roles: [Role.ADMIN, Role.HOSPITAL] }),
        capability: HOSPITAL_CONTACT_CAPABILITIES.update,
        scope: "DIRECT_HOSPITAL_OWNER",
        hospitalId: hospitalA,
      }).allowed,
    ).toBe(true);
    expect(
      decideHospitalContactPolicy({
        actor: actor({ roles: [Role.ADMIN], hospitalMemberships: [] }),
        capability: HOSPITAL_CONTACT_CAPABILITIES.update,
        scope: "DIRECT_HOSPITAL_OWNER",
        hospitalId: hospitalA,
      }).allowed,
    ).toBe(false);
  });

  it("permits Patient SELF read even with Work roles, without granting Patient edit", () => {
    const patient = actor({
      roles: [Role.PATIENT, Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: hospitalA,
          membershipType: MembershipType.OWNER,
          profession: "NURSE",
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    expect(
      decideHospitalContactPolicy({
        actor: patient,
        capability: HOSPITAL_CONTACT_CAPABILITIES.read,
        scope: "PATIENT_SELF_RELATIONSHIP",
      }).allowed,
    ).toBe(true);
    expect(
      decideHospitalContactPolicy({
        actor: patient,
        capability: HOSPITAL_CONTACT_CAPABILITIES.update,
        scope: "PATIENT_SELF_RELATIONSHIP",
        hospitalId: hospitalA,
      }).allowed,
    ).toBe(false);
  });

  it("requires an authenticated Patient identity for SELF read", () => {
    expect(
      decideHospitalContactPolicy({
        actor: actor({ roles: [Role.PATIENT], personId: " " }),
        capability: HOSPITAL_CONTACT_CAPABILITIES.read,
        scope: "PATIENT_SELF_RELATIONSHIP",
      }).allowed,
    ).toBe(false);
  });
});
