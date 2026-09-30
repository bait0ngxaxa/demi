import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import {
  getOwnPatientHospitalProfile,
  updateOwnPatientHospitalProfile,
  type PatientHospitalProfileDatabase,
} from "./patient-hospital-profile-service";

const userId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const relationshipId = "33333333-3333-4333-8333-333333333333";
const otherRelationshipId = "44444444-4444-4444-8444-444444444444";

const legacyValues = {
  gender: "ชาย",
  phoneNumber: "0812345678",
  addressText: "ที่อยู่เดิม",
  emergencyContactName: "ผู้ติดต่อเดิม",
  emergencyContactPhone: "0898765432",
  occupation: "อาชีพเดิม",
  educationLevel: "ระดับเดิม",
};

function actor(roles: readonly Role[] = [Role.PATIENT]): ActorContext {
  return {
    userId,
    personId,
    roles,
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
}

function createDatabase(options: {
  localProfile?: Record<string, unknown> | null;
  relationshipFound?: boolean;
  updateCount?: number;
} = {}) {
  const relationshipFindFirst = vi.fn().mockResolvedValue(
    options.relationshipFound === false
      ? null
      : {
          id: relationshipId,
          hospital: { name: "โรงพยาบาล ก" },
          hospitalProfile: options.localProfile ?? null,
          patientProfile: {
            ...legacyValues,
            person: { givenName: "สมชาย", familyName: "ใจดี" },
          },
        },
  );
  const profileFindFirst = vi.fn().mockResolvedValue({
    id: relationshipId,
    hospital: { name: "โรงพยาบาล ก" },
    hospitalProfile: options.localProfile ?? null,
    patientProfile: {
      ...legacyValues,
      person: { givenName: "สมชาย", familyName: "ใจดี" },
    },
  });
  const profileCreate = vi.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555" });
  const profileUpdateMany = vi.fn().mockResolvedValue({ count: options.updateCount ?? 1 });
  const transaction = {
    patientHospitalRelationship: { findFirst: relationshipFindFirst },
    patientHospitalProfile: { create: profileCreate, updateMany: profileUpdateMany },
  };
  const transactionCall = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(transaction),
  );
  const database = {
    patientHospitalRelationship: { findFirst: profileFindFirst },
    $transaction: transactionCall,
  } as unknown as PatientHospitalProfileDatabase;

  return {
    database,
    profileFindFirst,
    relationshipFindFirst,
    profileCreate,
    profileUpdateMany,
    transactionCall,
  };
}

describe("Patient Hospital profile service", () => {
  it("reads the exact relationship and reports legacy values as fallback", async () => {
    const { database, profileFindFirst } = createDatabase();

    await expect(getOwnPatientHospitalProfile(actor(), relationshipId, database)).resolves.toEqual({
      relationshipId,
      hospitalName: "โรงพยาบาล ก",
      person: { givenName: "สมชาย", familyName: "ใจดี" },
      profile: legacyValues,
      source: "LEGACY_FALLBACK",
      version: 0,
    });
    expect(profileFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: relationshipId,
          patientProfile: expect.objectContaining({
            is: expect.objectContaining({ personId, person: expect.any(Object) }),
          }),
        }),
      }),
    );
  });

  it("materializes all effective legacy values on the first exact Hospital edit", async () => {
    const { database, relationshipFindFirst, profileCreate } = createDatabase();

    await expect(
      updateOwnPatientHospitalProfile(
        actor(),
        relationshipId,
        { expectedVersion: 0, gender: "หญิง" },
        database,
      ),
    ).resolves.toEqual({ version: 1 });

    expect(relationshipFindFirst).toHaveBeenCalledOnce();
    expect(profileCreate).toHaveBeenCalledWith({
      data: {
        patientHospitalRelationshipId: relationshipId,
        ...legacyValues,
        gender: "หญิง",
        version: 1,
      },
    });
  });

  it("updates one Hospital row with a version predicate and preserves explicit clears", async () => {
    const { database, profileUpdateMany } = createDatabase({
      localProfile: { ...legacyValues, version: 3 },
    });

    await expect(
      updateOwnPatientHospitalProfile(
        actor([Role.PATIENT, Role.HOSPITAL]),
        relationshipId,
        { expectedVersion: 3, phoneNumber: "" },
        database,
      ),
    ).resolves.toEqual({ version: 4 });

    expect(profileUpdateMany).toHaveBeenCalledWith({
      where: { patientHospitalRelationshipId: relationshipId, version: 3 },
      data: { version: { increment: 1 }, phoneNumber: null },
    });
  });

  it("rejects stale versions before writing", async () => {
    const { database, profileUpdateMany, profileCreate } = createDatabase({
      localProfile: { ...legacyValues, version: 4 },
    });

    await expect(
      updateOwnPatientHospitalProfile(
        actor(),
        relationshipId,
        { expectedVersion: 3, occupation: "ครู" },
        database,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(profileUpdateMany).not.toHaveBeenCalled();
    expect(profileCreate).not.toHaveBeenCalled();
  });

  it("turns a concurrent compare-and-swap miss into Conflict", async () => {
    const { database, profileUpdateMany } = createDatabase({
      localProfile: { ...legacyValues, version: 3 },
      updateCount: 0,
    });

    await expect(
      updateOwnPatientHospitalProfile(
        actor(),
        relationshipId,
        { expectedVersion: 3, occupation: "ครู" },
        database,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(profileUpdateMany).toHaveBeenCalledOnce();
  });

  it("does not let a different Patient choose another relationship", async () => {
    const { database, relationshipFindFirst, profileCreate } = createDatabase({
      relationshipFound: false,
    });

    await expect(
      updateOwnPatientHospitalProfile(actor(), otherRelationshipId, {
        expectedVersion: 0,
        phoneNumber: "0812345678",
      }, database),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(profileCreate).not.toHaveBeenCalled();
    expect(relationshipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: otherRelationshipId }) }),
    );
  });

  it("denies a Work-only actor before database access", async () => {
    const { database, transactionCall } = createDatabase();

    await expect(
      updateOwnPatientHospitalProfile(actor([Role.HOSPITAL]), relationshipId, {
        expectedVersion: 0,
        phoneNumber: "0812345678",
      }, database),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionCall).not.toHaveBeenCalled();
  });

  it.each(["personId", "patientProfileId", "hospitalId", "roles", "authSubject"])(
    "rejects client supplied authority field %s",
    async (field) => {
      const { database, transactionCall } = createDatabase();

      await expect(
        updateOwnPatientHospitalProfile(
          actor(),
          relationshipId,
          { expectedVersion: 0, phoneNumber: "0812345678", [field]: userId },
          database,
        ),
      ).rejects.toBeDefined();
      expect(transactionCall).not.toHaveBeenCalled();
    },
  );
});
