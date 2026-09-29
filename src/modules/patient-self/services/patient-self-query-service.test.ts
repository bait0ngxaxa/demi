import { HospitalStatus, Role, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

import {
  patientSelfContextSelect,
  resolveOwnPatientContext,
  type PatientSelfQueryDatabase,
} from "./patient-self-query-service";

const userId = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";
const hospitalOneId = "44444444-4444-4444-8444-444444444444";
const hospitalTwoId = "55555555-5555-4555-8555-555555555555";
const hospitalThreeId = "77777777-7777-4777-8777-777777777777";

function actor(roles: readonly Role[] = [Role.PATIENT]): ActorContext {
  return {
    userId,
    personId,
    roles,
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
}

function ownPersonRecord(): Record<string, unknown> {
  return {
    id: personId,
    identityKeyHash: "must-not-leave-the-service",
    givenName: "สมชาย",
    familyName: "ใจดี",
    user: { id: userId, authSubject: "must-not-leave-the-service" },
    patientProfile: {
      id: "66666666-6666-4666-8666-666666666666",
      dateOfBirth: new Date("1977-01-01T00:00:00.000Z"),
      gender: "ชาย",
      phoneNumber: "0812345678",
      addressText: "99 ถนนตัวอย่าง",
      occupation: "ไม่ควรแสดง",
      educationLevel: "ไม่ควรแสดง",
      patientClassification: { classification: "DIABETES" },
      hospitalRelationships: [
        {
          id: hospitalOneId,
          patientProfileId: "another-internal-id",
          hospitalId: "hospital-id-one",
          hospitalNumber: "HN-001",
          hospital: {
            id: "hospital-id-one",
            hospitalCode: "H-001",
            name: "โรงพยาบาล ก",
            status: HospitalStatus.ACTIVE,
          },
        },
        {
          id: hospitalTwoId,
          patientProfileId: "another-internal-id",
          hospitalId: "hospital-id-two",
          hospitalNumber: null,
          hospital: {
            id: "hospital-id-two",
            hospitalCode: "H-002",
            name: "โรงพยาบาล ข",
            status: HospitalStatus.SUSPENDED,
          },
        },
        {
          id: hospitalThreeId,
          patientProfileId: "another-internal-id",
          hospitalId: "hospital-id-three",
          hospitalNumber: "HN-003",
          hospital: {
            id: "hospital-id-three",
            hospitalCode: "H-003",
            name: "โรงพยาบาล ค",
            status: HospitalStatus.PENDING_VERIFICATION,
          },
        },
      ],
    },
  };
}

function createDatabase(record: unknown = ownPersonRecord()) {
  const findFirst = vi.fn().mockResolvedValue(record);
  const database = { person: { findFirst } } as unknown as PatientSelfQueryDatabase;

  return { database, findFirst };
}

describe("Patient self query boundary", () => {
  it("resolves a Patient from the authenticated User → Person → PatientProfile chain", async () => {
    const { database, findFirst } = createDatabase();

    const result = await resolveOwnPatientContext(actor(), { database });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: personId,
        user: {
          is: {
            id: userId,
            status: UserStatus.ACTIVE,
            roles: { some: { role: Role.PATIENT } },
          },
        },
      },
      select: patientSelfContextSelect,
    });
    expect(result).toEqual({
      person: { givenName: "สมชาย", familyName: "ใจดี" },
      profile: {
        phoneNumber: "0812345678",
        addressText: "99 ถนนตัวอย่าง",
      },
      hospitalRelationships: [
        {
          hospitalCode: "H-001",
          hospitalName: "โรงพยาบาล ก",
          hospitalNumber: "HN-001",
          hospitalStatus: HospitalStatus.ACTIVE,
        },
        {
          hospitalCode: "H-002",
          hospitalName: "โรงพยาบาล ข",
          hospitalNumber: null,
          hospitalStatus: HospitalStatus.SUSPENDED,
        },
        {
          hospitalCode: "H-003",
          hospitalName: "โรงพยาบาล ค",
          hospitalNumber: "HN-003",
          hospitalStatus: HospitalStatus.PENDING_VERIFICATION,
        },
      ],
    });
  });

  it.each([
    ["OSM and Patient", [Role.OSM, Role.PATIENT]],
    ["Hospital and Patient", [Role.HOSPITAL, Role.PATIENT]],
  ] as const)("resolves self independently for %s", async (_label, roles) => {
    const { database, findFirst } = createDatabase();

    const result = await resolveOwnPatientContext(actor(roles), { database });

    expect(result?.person).toEqual({ givenName: "สมชาย", familyName: "ใจดี" });
    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: {
        id: personId,
        user: { is: { id: userId, roles: { some: { role: Role.PATIENT } } } },
      },
    });
    expect(JSON.stringify(result)).not.toContain("patientHospitalRelationshipId");
  });

  it("resolves all own Hospital relationships independently of Hospital operational status", async () => {
    const { database } = createDatabase();

    const result = await resolveOwnPatientContext(actor(), { database });
    const relationshipSelect = patientSelfContextSelect.patientProfile.select.hospitalRelationships;

    expect(relationshipSelect).not.toHaveProperty("where");
    expect(relationshipSelect.orderBy).toEqual([
      { hospital: { name: "asc" } },
      { id: "asc" },
    ]);
    expect(relationshipSelect.select.hospital.select).toHaveProperty("status", true);
    expect(result?.hospitalRelationships).toEqual([
      {
        hospitalCode: "H-001",
        hospitalName: "โรงพยาบาล ก",
        hospitalNumber: "HN-001",
        hospitalStatus: HospitalStatus.ACTIVE,
      },
      {
        hospitalCode: "H-002",
        hospitalName: "โรงพยาบาล ข",
        hospitalNumber: null,
        hospitalStatus: HospitalStatus.SUSPENDED,
      },
      {
        hospitalCode: "H-003",
        hospitalName: "โรงพยาบาล ค",
        hospitalNumber: "HN-003",
        hospitalStatus: HospitalStatus.PENDING_VERIFICATION,
      },
    ]);
  });

  it("returns an explicit incomplete result when the identity or PatientProfile is missing", async () => {
    const { database, findFirst } = createDatabase(null);

    await expect(resolveOwnPatientContext(actor(), { database })).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledOnce();

    const missingProfile = createDatabase({
      givenName: "สมชาย",
      familyName: "ใจดี",
      patientProfile: null,
    });
    await expect(resolveOwnPatientContext(actor(), { database: missingProfile.database })).resolves.toBeNull();
  });

  it("does not query for a non-Patient or incomplete ActorContext identity", async () => {
    const { database, findFirst } = createDatabase();

    await expect(resolveOwnPatientContext(actor([Role.OSM]), { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      resolveOwnPatientContext({ ...actor(), personId: " " }, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("wraps database errors without exposing them", async () => {
    const failingDatabase = {
      person: { findFirst: vi.fn().mockRejectedValue(new Error("sensitive database detail")) },
    } as unknown as PatientSelfQueryDatabase;

    await expect(resolveOwnPatientContext(actor(), { database: failingDatabase })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
  });

  it("does not select internal identity, auth, classification, DOB, or clinical fields", () => {
    const serialized = JSON.stringify(patientSelfContextSelect);

    for (const forbiddenField of [
      "identityKeyHash",
      "authSubject",
      "dateOfBirth",
      "gender",
      "occupation",
      "educationLevel",
      "emergencyContactName",
      "emergencyContactPhone",
      "patientClassification",
      "patientHospitalRelationshipId",
    ]) {
      expect(serialized).not.toContain(forbiddenField);
    }

    expect(serialized).not.toContain('"id":true');
    expect(patientSelfContextSelect).not.toHaveProperty("id");
    expect(patientSelfContextSelect.patientProfile.select).not.toHaveProperty("id");
    expect(
      patientSelfContextSelect.patientProfile.select.hospitalRelationships.select,
    ).not.toHaveProperty("id");
    expect(
      patientSelfContextSelect.patientProfile.select.hospitalRelationships.select.hospital.select,
    ).not.toHaveProperty("id");
  });
});
