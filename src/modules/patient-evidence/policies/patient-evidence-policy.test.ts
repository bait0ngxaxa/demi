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
  canRemovePatientEvidenceArtifact,
  decidePatientEvidencePolicy,
  PATIENT_ARTIFACT_CREATE_CAPABILITY,
  PATIENT_ARTIFACT_READ_CAPABILITY,
  type PatientEvidenceCapability,
  type PatientEvidencePolicyTarget,
} from "./patient-evidence-policy";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

const target: PatientEvidencePolicyTarget = {
  hospitalId,
  hospitalStatus: HospitalStatus.ACTIVE,
  assignedOsmUserId: null,
};

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: actorUserId,
    personId: "55555555-5555-4555-8555-555555555555",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function decide(
  currentActor: ActorContext,
  capability: PatientEvidenceCapability = PATIENT_ARTIFACT_READ_CAPABILITY,
  targetOverride: PatientEvidencePolicyTarget = target,
) {
  return decidePatientEvidencePolicy({ actor: currentActor, capability, target: targetOverride });
}

describe("Patient Evidence authorization policy", () => {
  it.each([MembershipType.OWNER, MembershipType.MEMBER])(
    "allows a direct Hospital %s",
    (membershipType) => {
      expect(
        decide(
          actor({
            roles: [Role.HOSPITAL],
            hospitalMemberships: [
              {
                hospitalId,
                membershipType,
                profession: Profession.NURSE,
                status: MembershipStatus.ACTIVE,
                hospitalStatus: HospitalStatus.ACTIVE,
              },
            ],
          }),
          PATIENT_ARTIFACT_CREATE_CAPABILITY,
        ),
      ).toEqual({ allowed: true, reason: "active_direct_hospital_scope" });
    },
  );

  it("allows an exact active OSM assignment", () => {
    expect(
      decide(
        actor({
          roles: [Role.OSM],
          hospitalMemberships: [],
          osmHospitalRelationships: [
            { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
          ],
        }),
        PATIENT_ARTIFACT_READ_CAPABILITY,
        { ...target, assignedOsmUserId: actorUserId },
      ),
    ).toEqual({ allowed: true, reason: "active_osm_assignment_scope" });
  });

  it("allows an ADMIN actor when the exact active OSM path is valid", () => {
    expect(
      decide(
        actor({
          roles: [Role.ADMIN, Role.OSM],
          osmHospitalRelationships: [
            { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
          ],
        }),
        PATIENT_ARTIFACT_CREATE_CAPABILITY,
        { ...target, assignedOsmUserId: actorUserId },
      ),
    ).toEqual({ allowed: true, reason: "active_osm_assignment_scope" });
  });

  it("allows a valid Hospital path for a multi-role ADMIN actor", () => {
    expect(
      decide(
        actor({
          roles: [Role.ADMIN, Role.HOSPITAL],
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
      ).allowed,
    ).toBe(true);
  });

  it.each([Role.ADMIN, Role.CAREGIVER])("denies a %s-only actor", (role) => {
    expect(decide(actor({ roles: [role] }))).toEqual({
      allowed: false,
      reason: "artifact_role_required",
    });
  });

  it("denies an unassigned OSM even when the Hospital relationship is active", () => {
    expect(
      decide(
        actor({
          roles: [Role.OSM],
          osmHospitalRelationships: [
            { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
          ],
        }),
      ),
    ).toEqual({ allowed: false, reason: "active_osm_assignment_scope_required" });
  });

  it("does not widen access through hierarchy or profession alone", () => {
    expect(
      decide(
        actor({
          roles: [Role.OSM],
          hospitalMemberships: [
            {
              hospitalId: otherHospitalId,
              membershipType: MembershipType.MEMBER,
              profession: Profession.DOCTOR,
              status: MembershipStatus.ACTIVE,
              hospitalStatus: HospitalStatus.ACTIVE,
            },
          ],
          osmHospitalRelationships: [],
        }),
      ).allowed,
    ).toBe(false);
  });

  it.each([Role.PATIENT, Role.CAREGIVER])("denies %s self-service", (role) => {
    expect(decide(actor({ roles: [role] }))).toEqual({
      allowed: false,
      reason: "artifact_role_required",
    });
  });

  it("rejects inactive target Hospitals", () => {
    expect(
      decidePatientEvidencePolicy({
        actor: actor({
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
        }),
        capability: PATIENT_ARTIFACT_READ_CAPABILITY,
        target: { ...target, hospitalStatus: HospitalStatus.SUSPENDED },
      }),
    ).toEqual({ allowed: false, reason: "inactive_target_hospital" });
  });
});

describe("Patient Evidence removal rule (N4)", () => {
  const otherUserId = "66666666-6666-4666-8666-666666666666";
  const membership = (membershipType: MembershipType, status: MembershipStatus = MembershipStatus.ACTIVE) => ({
    hospitalId,
    membershipType,
    profession: Profession.NURSE,
    status,
    hospitalStatus: HospitalStatus.ACTIVE,
  });

  it("allows the uploader", () => {
    const osm = actor({ roles: [Role.OSM] });

    expect(canRemovePatientEvidenceArtifact({ actor: osm, target, createdByUserId: actorUserId })).toBe(true);
  });

  it.each([MembershipType.OWNER, MembershipType.MEMBER])("allows a direct %s on another user's upload", (type) => {
    expect(
      canRemovePatientEvidenceArtifact({
        actor: actor({ hospitalMemberships: [membership(type)] }),
        target,
        createdByUserId: otherUserId,
      }),
    ).toBe(true);
  });

  it("refuses an อสม. on another user's upload", () => {
    const osm = actor({
      roles: [Role.OSM],
      osmHospitalRelationships: [
        { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
      ],
    });

    expect(
      canRemovePatientEvidenceArtifact({ actor: osm, target: { ...target, assignedOsmUserId: actorUserId }, createdByUserId: otherUserId }),
    ).toBe(false);
  });

  it("refuses a member of another Hospital, an inactive membership and a membership without the HOSPITAL role", () => {
    expect(
      canRemovePatientEvidenceArtifact({
        actor: actor({ hospitalMemberships: [{ ...membership(MembershipType.OWNER), hospitalId: otherHospitalId }] }),
        target,
        createdByUserId: otherUserId,
      }),
    ).toBe(false);
    expect(
      canRemovePatientEvidenceArtifact({
        actor: actor({ hospitalMemberships: [membership(MembershipType.MEMBER, MembershipStatus.SUSPENDED)] }),
        target,
        createdByUserId: otherUserId,
      }),
    ).toBe(false);
    expect(
      canRemovePatientEvidenceArtifact({
        actor: actor({ roles: [Role.OSM], hospitalMemberships: [membership(MembershipType.OWNER)] }),
        target,
        createdByUserId: otherUserId,
      }),
    ).toBe(false);
  });
});
