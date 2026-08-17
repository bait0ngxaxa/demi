import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  PATIENT_DIRECTORY_PAGE_SIZE,
  patientDirectoryQuerySchema,
} from "@/modules/patient-directory/schemas/patient-directory-schemas";
import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  findPatientDirectory,
  getPatientDirectoryDetail,
  patientDirectoryInternals,
  type PatientDirectoryDatabase,
} from "./patient-directory-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const patientProfileId = "33333333-3333-4333-8333-333333333333";

const directoryActor: ActorContext = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
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
};

function createDirectoryDatabase(total: number): {
  database: PatientDirectoryDatabase;
  count: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
} {
  const count = vi.fn().mockResolvedValue(total);
  const findMany = vi.fn().mockResolvedValue([]);

  return {
    database: {
      hospital: {
        findFirst: vi.fn().mockResolvedValue({ id: hospitalId, name: "โรงพยาบาลทดสอบ" }),
      },
      patientHospitalRelationship: {
        count,
        findMany,
      },
    } as unknown as PatientDirectoryDatabase,
    count,
    findMany,
  };
}

describe("Patient directory query boundary", () => {
  it("normalizes bounded query input and defaults an empty lookup value", () => {
    expect(
      patientDirectoryInternals.parseDirectoryQuery({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "  สมชาย  ",
        page: "2",
      }),
    ).toEqual({
      targetHospitalId: hospitalId,
      lookupType: "NAME",
      value: "สมชาย",
      page: 2,
    });
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "   ",
        page: "1",
      }).success,
    ).toBe(true);
  });

  it("rejects unbounded search input and unsafe page values while accepting large safe pages", () => {
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "x".repeat(121),
        page: "1",
      }).success,
    ).toBe(false);
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "HOSPITAL_NUMBER",
        value: "x".repeat(65),
        page: "1",
      }).success,
    ).toBe(false);
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "สมชาย",
        page: String(Number.MAX_SAFE_INTEGER),
      }).success,
    ).toBe(true);
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "สมชาย",
        page: String(Number.MAX_SAFE_INTEGER + 1),
      }).success,
    ).toBe(false);
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "สมชาย",
        page: "1",
        sort: "arbitrary",
      }).success,
    ).toBe(false);
  });

  it("builds name and exact HN filters under the direct Hospital relationship boundary", () => {
    const nameWhere = patientDirectoryInternals.buildPatientRelationshipWhere(
      "44444444-4444-4444-8444-444444444444",
      {
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "สมชาย ผู้ป่วย",
        page: 1,
      },
    );
    const hnWhere = patientDirectoryInternals.buildPatientRelationshipWhere(
      "44444444-4444-4444-8444-444444444444",
      {
        targetHospitalId: hospitalId,
        lookupType: "HOSPITAL_NUMBER",
        value: "HN-001",
        page: 1,
      },
    );

    expect(nameWhere).toMatchObject({ hospitalId, hospital: { status: "ACTIVE" } });
    expect(nameWhere.patientProfile).toMatchObject({
      person: {
        AND: [
          { OR: [{ givenName: { contains: "สมชาย", mode: "insensitive" } }, { familyName: { contains: "สมชาย", mode: "insensitive" } }] },
          { OR: [{ givenName: { contains: "ผู้ป่วย", mode: "insensitive" } }, { familyName: { contains: "ผู้ป่วย", mode: "insensitive" } }] },
        ],
      },
    });
    expect(hnWhere).toMatchObject({ hospitalId, hospitalNumber: "HN-001" });
  });

  it("uses a fixed page size and a deterministic name/id order", () => {
    expect(PATIENT_DIRECTORY_PAGE_SIZE).toBe(25);
    expect(patientDirectoryInternals.patientDirectoryOrderBy).toEqual([
      { patientProfile: { person: { givenName: "asc" } } },
      { patientProfile: { person: { familyName: "asc" } } },
      { id: "asc" },
    ]);
  });

  it("keeps next-page transitions valid beyond the former 1,000-page ceiling", async () => {
    const { database, findMany } = createDirectoryDatabase(30_000);

    const result = await findPatientDirectory(
      directoryActor,
      {
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "",
        page: "1000",
      },
      { database },
    );

    expect(result.totalPages).toBe(1_200);
    expect(result.page).toBe(1_000);
    expect(result.hasNextPage).toBe(true);
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: result.lookupType,
        value: result.value,
        page: result.page + 1,
      }).success,
    ).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: (1_000 - 1) * PATIENT_DIRECTORY_PAGE_SIZE,
        take: PATIENT_DIRECTORY_PAGE_SIZE,
      }),
    );
  });

  it("clamps a very large safe page before calculating the database offset", async () => {
    const { database, count, findMany } = createDirectoryDatabase(30_000);

    const result = await findPatientDirectory(
      directoryActor,
      {
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "",
        page: String(Number.MAX_SAFE_INTEGER),
      },
      { database },
    );

    expect(count).toHaveBeenCalledOnce();
    expect(result.page).toBe(result.totalPages);
    expect(result.totalPages).toBe(1_200);
    expect(result.hasNextPage).toBe(false);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: (1_200 - 1) * PATIENT_DIRECTORY_PAGE_SIZE,
        take: PATIENT_DIRECTORY_PAGE_SIZE,
      }),
    );
  });

  it("projects only the accepted minimal detail fields", () => {
    const item = patientDirectoryInternals.toPatientDirectoryItem({
      id: relationshipId,
      hospitalNumber: "HN-001",
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      patientProfile: {
        id: patientProfileId,
        person: { givenName: "สมชาย", familyName: "ผู้ป่วย" },
      },
    });

    expect(item).toEqual({
      patientProfileId,
      patientHospitalRelationshipId: relationshipId,
      displayName: "สมชาย ผู้ป่วย",
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      hospitalNumber: "HN-001",
    });
    expect(Object.keys(patientDirectoryInternals.patientDirectorySelect).sort()).toEqual([
      "hospital",
      "hospitalNumber",
      "id",
      "patientProfile",
    ]);
    expect(JSON.stringify(item)).not.toContain("identityKeyHash");
    expect(JSON.stringify(item)).not.toContain("authSubject");
    expect(JSON.stringify(item)).not.toContain("activation");
    expect(JSON.stringify(item)).not.toContain("clinical");
  });

  it("projects the selected profile fields only through the authorized relationship detail query", async () => {
    const dateOfBirth = new Date("1977-01-01T00:00:00.000Z");
    const findFirst = vi.fn().mockResolvedValue({
      id: relationshipId,
      hospitalNumber: "HN-001",
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      patientProfile: {
        id: patientProfileId,
        dateOfBirth,
        gender: "ชาย",
        phoneNumber: "0812345678",
        addressText: "99 ถนนตัวอย่าง",
        emergencyContactName: "สมหญิง ผู้ติดต่อ",
        emergencyContactPhone: "0898765432",
        occupation: "เกษตรกร",
        educationLevel: "มัธยมศึกษา",
        person: { givenName: "สมชาย", familyName: "ผู้ป่วย" },
      },
    });
    const database = {
      patientHospitalRelationship: { findFirst },
    } as unknown as PatientDirectoryDatabase;

    const result = await getPatientDirectoryDetail(directoryActor, relationshipId, { database });

    expect(result).toEqual({
      patientProfileId,
      patientHospitalRelationshipId: relationshipId,
      displayName: "สมชาย ผู้ป่วย",
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      hospitalNumber: "HN-001",
      profile: {
        dateOfBirth,
        gender: "ชาย",
        phoneNumber: "0812345678",
        addressText: "99 ถนนตัวอย่าง",
        emergencyContactName: "สมหญิง ผู้ติดต่อ",
        emergencyContactPhone: "0898765432",
        occupation: "เกษตรกร",
        educationLevel: "มัธยมศึกษา",
      },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: relationshipId, OR: expect.any(Array) }),
        select: patientDirectoryInternals.patientDetailSelect,
      }),
    );
    expect(Object.keys(result.profile)).toEqual([
      "dateOfBirth",
      "gender",
      "phoneNumber",
      "addressText",
      "emergencyContactName",
      "emergencyContactPhone",
      "occupation",
      "educationLevel",
    ]);
    expect(JSON.stringify(result)).not.toContain("identityKeyHash");
    expect(JSON.stringify(result)).not.toContain("authSubject");
    expect(JSON.stringify(result)).not.toContain("clinical");
  });
});
