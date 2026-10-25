import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  getPatientActivationCandidateForRelationship,
  patientActivationQueryInternals,
  type PatientActivationQueryDatabase,
} from "./patient-activation-query-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";

const now = new Date("2026-08-15T12:00:00.000Z");
const baseUser = {
  status: UserStatus.PROVISIONED,
  authSubject: null,
  roles: [{ role: Role.PATIENT }],
};

const activation = {
  expiresAt: new Date("2026-08-16T12:00:00.000Z"),
  claimedAt: null,
  claimExpiresAt: null,
  reconciliationRequiredAt: null,
  usedAt: null,
  revokedAt: null,
};

describe("patient activation query projection", () => {
  it("builds a case-insensitive, term-by-term name filter", () => {
    expect(
      patientActivationQueryInternals.buildNameWhere("  สมชาย   ใจดี "),
    ).toEqual({
      AND: [
        {
          OR: [
            { givenName: { contains: "สมชาย", mode: "insensitive" } },
            { familyName: { contains: "สมชาย", mode: "insensitive" } },
          ],
        },
        {
          OR: [
            { givenName: { contains: "ใจดี", mode: "insensitive" } },
            { familyName: { contains: "ใจดี", mode: "insensitive" } },
          ],
        },
      ],
    });
  });

  it.each([
    ["no activation", [], "NOT_ISSUED"],
    ["valid activation", [activation], "ISSUED"],
    [
      "active claim",
      [
        {
          ...activation,
          claimedAt: new Date("2026-08-15T11:59:00.000Z"),
          claimExpiresAt: new Date("2026-08-15T12:05:00.000Z"),
        },
      ],
      "IN_PROGRESS",
    ],
    [
      "expired activation",
      [{ ...activation, expiresAt: new Date("2026-08-15T11:59:00.000Z") }],
      "EXPIRED",
    ],
    [
      "reconciliation marker",
      [{ ...activation, reconciliationRequiredAt: new Date("2026-08-15T12:01:00.000Z") }],
      "RECONCILIATION_REQUIRED",
    ],
  ])("projects %s", (_label, activations, expectedStatus) => {
    expect(
      patientActivationQueryInternals.projectActivationStatus(
        baseUser,
        activations,
        now,
      ).activationStatus,
    ).toBe(expectedStatus);
  });

  it("projects a mapped ACTIVE User as active without considering activation rows", () => {
    expect(
      patientActivationQueryInternals.projectActivationStatus(
        {
          status: UserStatus.ACTIVE,
          authSubject: "11111111-1111-4111-8111-111111111111",
          roles: [{ role: Role.PATIENT }, { role: Role.OSM }],
        },
        [],
        now,
      ),
    ).toEqual({
      activationStatus: "ACTIVE",
      activationExpiresAt: null,
      activationMayBeIssued: false,
    });
  });

  it("fails closed for an ACTIVE User with an invalid provider mapping", () => {
    expect(
      patientActivationQueryInternals.projectActivationStatus(
        {
          status: UserStatus.ACTIVE,
          authSubject: "invalid-subject",
          roles: [{ role: Role.PATIENT }],
        },
        [],
        now,
      ).activationStatus,
    ).toBe("RECONCILIATION_REQUIRED");
  });
  it("fails closed with RECONCILIATION_REQUIRED and no issuance when the User has workforce authority", () => {
    expect(
      patientActivationQueryInternals.projectActivationStatus(baseUser, [], now, true),
    ).toEqual({
      activationStatus: "RECONCILIATION_REQUIRED",
      activationExpiresAt: null,
      activationMayBeIssued: false,
    });
  });
});

describe("patient activation relationship lookup", () => {
  const hospitalId = "11111111-1111-4111-8111-111111111111";
  const relationshipId = "22222222-2222-4222-8222-222222222222";
  const userId = "33333333-3333-4333-8333-333333333333";
  const subject: ActorContext = {
    userId: "44444444-4444-4444-8444-444444444444",
    personId: "55555555-5555-4555-8555-555555555555",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [{ hospitalId, membershipType: MembershipType.OWNER, profession: Profession.NURSE, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    osmHospitalRelationships: [],
  };

  function database(relationship: unknown): PatientActivationQueryDatabase {
    return {
      user: {
        findUnique: async () => ({ status: UserStatus.ACTIVE, roles: [{ role: Role.HOSPITAL }] }),
        findMany: async () => [],
      },
      hospitalMembership: { findFirst: async () => ({ id: "owner-membership" }) },
      patientHospitalRelationship: { findFirst: async () => relationship },
      patientActivation: { findMany: async () => [] },
    } as unknown as PatientActivationQueryDatabase;
  }

  it("resolves one current patient only from the exact Hospital relationship", async () => {
    const findRelationship = vi.fn(async () => ({
      hospitalNumber: "HN-01",
      patientProfile: {
        id: "profile-id",
        person: {
          givenName: "สมชาย",
          familyName: "ใจดี",
          user: { id: userId, status: UserStatus.PROVISIONED, authSubject: null, roles: [{ role: Role.PATIENT }] },
        },
      },
    }));
    const db = database(undefined) as unknown as Record<string, unknown>;
    const patientHospitalRelationship = { findFirst: findRelationship };
    Object.assign(db, { patientHospitalRelationship });

    await expect(getPatientActivationCandidateForRelationship(subject, {
      targetHospitalId: hospitalId,
      patientHospitalRelationshipId: relationshipId,
    }, {
      database: db as unknown as PatientActivationQueryDatabase,
      now: () => now,
    })).resolves.toMatchObject({
      userId,
      patientProfileId: "profile-id",
      hospitalId,
      displayName: "สมชาย ใจดี",
      hospitalNumber: "HN-01",
      activationStatus: "NOT_ISSUED",
      activationMayBeIssued: true,
    });

    expect(findRelationship).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: relationshipId, hospitalId, endedAt: null, hospital: { status: "ACTIVE" } },
    }));
  });

  it("does not turn an ended or missing relationship into a candidate", async () => {
    await expect(getPatientActivationCandidateForRelationship(subject, {
      targetHospitalId: hospitalId,
      patientHospitalRelationshipId: relationshipId,
    }, { database: database(null) })).resolves.toBeNull();
  });
});
