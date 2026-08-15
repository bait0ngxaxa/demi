import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  canIssuePatientActivation,
  decidePatientActivationIssuePolicy,
  PATIENT_ACTIVATION_ISSUE_CAPABILITY,
} from "./patient-activation-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function createActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
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

const targetPatient = {
  status: UserStatus.PROVISIONED,
  authSubject: null,
  hasPatientRole: true,
  hasPatientProfile: true,
  hasHospitalRelationship: true,
};

describe("patient activation issuance policy", () => {
  it("allows an active Hospital direct member for a provisioned Patient", () => {
    expect(
      canIssuePatientActivation(createActor(), targetPatient, hospitalId),
    ).toBe(true);
  });

  it("does not grant the capability to OSM or an unrelated Hospital", () => {
    expect(
      canIssuePatientActivation(
        createActor({ roles: [Role.OSM] }),
        targetPatient,
        hospitalId,
      ),
    ).toBe(false);
    expect(
      canIssuePatientActivation(
        createActor({
          hospitalMemberships: [
            {
              hospitalId: "44444444-4444-4444-8444-444444444444",
              membershipType: MembershipType.OWNER,
              profession: null,
              status: MembershipStatus.ACTIVE,
              hospitalStatus: HospitalStatus.ACTIVE,
            },
          ],
        }),
        targetPatient,
        hospitalId,
      ),
    ).toBe(false);
  });

  it("keeps the capability name separate from patient provisioning", () => {
    expect(
      decidePatientActivationIssuePolicy({
        actor: createActor(),
        capability: "patient:provision",
        targetHospitalId: hospitalId,
      }),
    ).toEqual({ allowed: false, reason: "invalid_capability" });
    expect(
      decidePatientActivationIssuePolicy({
        actor: createActor(),
        capability: PATIENT_ACTIVATION_ISSUE_CAPABILITY,
        targetHospitalId: hospitalId,
      }),
    ).toEqual({ allowed: true, reason: "active_direct_hospital_scope" });
  });
});
