import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  PATIENT_DIRECTORY_PAGE_SIZE,
  patientDirectoryQuerySchema,
} from "@/modules/patient-directory/schemas/patient-directory-schemas";
import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  findPatientDirectory,
  findPatientsAssignedToOsmInHospital,
  getPatientDirectoryDetail,
  getPatientResponsibleOsm,
  buildAuthorizedHospitalWhere,
  patientDirectoryInternals,
  patientDirectorySelect,
  type PatientDirectoryDetailRecord,
  type PatientDirectoryDatabase,
} from "./patient-directory-query-service";
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

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

const ownerActor: ActorContext = {
  ...directoryActor,
  hospitalMemberships: [{
    hospitalId,
    membershipType: MembershipType.OWNER,
    profession: null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
};

const osmActor: ActorContext = {
  userId: "66666666-6666-4666-8666-666666666666",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.OSM],
  hospitalMemberships: [],
  osmHospitalRelationships: [{
    hospitalId,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
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
      buildAuthorizedHospitalWhere("44444444-4444-4444-8444-444444444444"),
      {
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "สมชาย ผู้ป่วย",
        page: 1,
      },
    );
    const hnWhere = patientDirectoryInternals.buildPatientRelationshipWhere(
      buildAuthorizedHospitalWhere("44444444-4444-4444-8444-444444444444"),
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
      selfRegisteredAt: null,
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
      classification: null,
      selfRegisteredAt: null,
    });
    expect(Object.keys(patientDirectoryInternals.patientDirectorySelect).sort()).toEqual([
      "hospital",
      "hospitalNumber",
      "id",
      "patientProfile",
      "selfRegisteredAt",
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
      hospitalProfile: null,
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
      classification: null,
      profileSource: "LEGACY_FALLBACK",
      access: "DIRECT",
      profile: {
        dateOfBirth,
        emergencyContactRelationship: null,
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
      "emergencyContactRelationship",
    ]);
    expect(JSON.stringify(result)).not.toContain("identityKeyHash");
    expect(JSON.stringify(result)).not.toContain("authSubject");
    expect(JSON.stringify(result)).not.toContain("clinical");
  });

  it("uses the exact relationship-local profile as authoritative, including cleared nulls", () => {
    const dateOfBirth = new Date("1977-01-01T00:00:00.000Z");
    const detail = patientDirectoryInternals.toPatientDirectoryDetail({
      id: relationshipId,
      hospitalNumber: "HN-001",
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      hospitalProfile: {
        gender: null,
        phoneNumber: null,
        addressText: "ที่อยู่เฉพาะโรงพยาบาลนี้",
        emergencyContactName: null,
        emergencyContactPhone: null,
        occupation: null,
        educationLevel: null,
        version: 2,
      },
      patientProfile: {
        id: patientProfileId,
        patientClassification: null,
        dateOfBirth,
        gender: "ชาย",
        phoneNumber: "0812345678",
        addressText: "ที่อยู่เดิม",
        emergencyContactName: "ผู้ติดต่อเดิม",
        emergencyContactPhone: "0898765432",
        occupation: "อาชีพเดิม",
        educationLevel: "ระดับเดิม",
        person: { givenName: "สมชาย", familyName: "ผู้ป่วย" },
      },
    } as PatientDirectoryDetailRecord);

    expect(detail.profileSource).toBe("HOSPITAL_LOCAL");
    expect(detail.profile).toEqual({
      dateOfBirth,
      emergencyContactRelationship: null,
      gender: null,
      phoneNumber: null,
      addressText: "ที่อยู่เฉพาะโรงพยาบาลนี้",
      emergencyContactName: null,
      emergencyContactPhone: null,
      occupation: null,
      educationLevel: null,
    });
  });

  it("does not select profile fields when the caller requests a Patient summary", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: relationshipId,
      hospitalNumber: "HN-001",
      selfRegisteredAt: null,
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      patientProfile: {
        id: patientProfileId,
        patientClassification: null,
        person: { givenName: "สมชาย", familyName: "ผู้ป่วย" },
      },
    });
    const database = { patientHospitalRelationship: { findFirst } } as unknown as PatientDirectoryDatabase;

    const result = await getPatientDirectoryDetail(
      directoryActor,
      relationshipId,
      { database },
      { includeProfile: false },
    );

    expect(result).toEqual({
      patientProfileId,
      patientHospitalRelationshipId: relationshipId,
      displayName: "สมชาย ผู้ป่วย",
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      hospitalNumber: "HN-001",
      classification: null,
      selfRegisteredAt: null,
      access: "DIRECT",
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: relationshipId, OR: expect.any(Array) }),
        select: patientDirectorySelect,
      }),
    );
    expect(JSON.stringify(result)).not.toContain("phoneNumber");
  });

  it("shows only a current active OSM assigned in the exact Patient Hospital Relationship", async () => {
    const assignedAt = new Date("2026-10-01T00:00:00.000Z");
    const findFirst = vi.fn().mockResolvedValue({
      osmAssignments: [{
        createdAt: assignedAt,
        osmUser: {
          status: UserStatus.ACTIVE,
          roles: [{ role: Role.OSM }],
          person: { givenName: "สมใจ", familyName: "อสม." },
          osmHospitalRelationships: [{
            status: MembershipStatus.ACTIVE,
            hospital: { status: HospitalStatus.ACTIVE },
          }],
        },
      }],
    });
    const database = { patientHospitalRelationship: { findFirst } } as unknown as PatientDirectoryDatabase;

    await expect(getPatientResponsibleOsm(ownerActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toEqual({
      status: "ASSIGNED",
      displayName: "สมใจ อสม.",
      assignedAt,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: relationshipId,
        hospitalId,
        OR: expect.any(Array),
      }),
      select: expect.objectContaining({
        osmAssignments: expect.objectContaining({
          where: { endedAt: null },
          take: 1,
        }),
      }),
    });
    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      select: {
        osmAssignments: {
          select: {
            osmUser: {
              select: {
                osmHospitalRelationships: {
                  where: {
                    hospitalId,
                    status: MembershipStatus.ACTIVE,
                    hospital: { status: HospitalStatus.ACTIVE },
                  },
                  orderBy: [{ id: "asc" }],
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(findFirst.mock.calls[0])).not.toContain("contactPhone");
  });

  it("distinguishes no current assignment from an open assignment with an ineligible OSM", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ osmAssignments: [] })
      .mockResolvedValueOnce({
        osmAssignments: [{
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          osmUser: {
            status: UserStatus.SUSPENDED,
            roles: [{ role: Role.OSM }],
            person: { givenName: "อดีต", familyName: "อสม." },
            osmHospitalRelationships: [{
              status: MembershipStatus.ACTIVE,
              hospital: { status: HospitalStatus.ACTIVE },
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        osmAssignments: [{
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          osmUser: {
            status: UserStatus.ACTIVE,
            roles: [],
            person: { givenName: "ไม่มี", familyName: "บทบาท" },
            osmHospitalRelationships: [{
              status: MembershipStatus.ACTIVE,
              hospital: { status: HospitalStatus.ACTIVE },
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        osmAssignments: [{
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          osmUser: {
            status: UserStatus.ACTIVE,
            roles: [{ role: Role.OSM }],
            person: { givenName: "ความสัมพันธ์", familyName: "ถูกระงับ" },
            osmHospitalRelationships: [{
              status: MembershipStatus.SUSPENDED,
              hospital: { status: HospitalStatus.ACTIVE },
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        osmAssignments: [{
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          osmUser: {
            status: UserStatus.ACTIVE,
            roles: [{ role: Role.OSM }],
            person: { givenName: "โรงพยาบาล", familyName: "ถูกระงับ" },
            osmHospitalRelationships: [{
              status: MembershipStatus.ACTIVE,
              hospital: { status: HospitalStatus.SUSPENDED },
            }],
          },
        }],
      });
    const database = { patientHospitalRelationship: { findFirst } } as unknown as PatientDirectoryDatabase;

    await expect(getPatientResponsibleOsm(ownerActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toEqual({ status: "UNASSIGNED" });
    await expect(getPatientResponsibleOsm(ownerActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(getPatientResponsibleOsm(ownerActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(getPatientResponsibleOsm(ownerActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(getPatientResponsibleOsm(ownerActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toEqual({ status: "UNAVAILABLE" });
  });

  it("uses an eligible exact-Hospital OSM relationship when inactive history is also present", async () => {
    const assignedAt = new Date("2026-10-02T00:00:00.000Z");
    const findFirst = vi.fn().mockResolvedValue({
      osmAssignments: [{
        createdAt: assignedAt,
        osmUser: {
          status: UserStatus.ACTIVE,
          roles: [{ role: Role.OSM }],
          person: { givenName: "สมใจ", familyName: "อสม." },
          osmHospitalRelationships: [
            { status: MembershipStatus.SUSPENDED, hospital: { status: HospitalStatus.ACTIVE } },
            { status: MembershipStatus.ACTIVE, hospital: { status: HospitalStatus.ACTIVE } },
          ],
        },
      }],
    });
    const database = { patientHospitalRelationship: { findFirst } } as unknown as PatientDirectoryDatabase;

    await expect(getPatientResponsibleOsm(ownerActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toMatchObject({ status: "ASSIGNED", displayName: "สมใจ อสม." });
    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      select: {
        osmAssignments: {
          select: {
            osmUser: {
              select: {
                osmHospitalRelationships: {
                  where: {
                    hospitalId,
                    status: MembershipStatus.ACTIVE,
                    hospital: { status: HospitalStatus.ACTIVE },
                  },
                  orderBy: [{ id: "asc" }],
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
  });

  it("uses the OSM-specific fallback when the assigned person has no display name", async () => {
    const assignedAt = new Date("2026-10-02T00:00:00.000Z");
    const findFirst = vi.fn().mockResolvedValue({
      osmAssignments: [{
        createdAt: assignedAt,
        osmUser: {
          status: UserStatus.ACTIVE,
          roles: [{ role: Role.OSM }],
          person: { givenName: null, familyName: null },
          osmHospitalRelationships: [{
            status: MembershipStatus.ACTIVE,
            hospital: { status: HospitalStatus.ACTIVE },
          }],
        },
      }],
    });
    const database = { patientHospitalRelationship: { findFirst } } as unknown as PatientDirectoryDatabase;

    await expect(getPatientResponsibleOsm(ownerActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toEqual({
      status: "ASSIGNED",
      displayName: "ไม่ระบุชื่อ",
      assignedAt,
    });
  });

  it("allows a direct Hospital MEMBER to read the current OSM without assignment-management scope", async () => {
    const assignedAt = new Date("2026-10-01T00:00:00.000Z");
    const findFirst = vi.fn().mockResolvedValue({
      osmAssignments: [{
        createdAt: assignedAt,
        osmUser: {
          status: UserStatus.ACTIVE,
          roles: [{ role: Role.OSM }],
          person: { givenName: "สมใจ", familyName: "อสม." },
          osmHospitalRelationships: [{
            status: MembershipStatus.ACTIVE,
            hospital: { status: HospitalStatus.ACTIVE },
          }],
        },
      }],
    });
    const database = { patientHospitalRelationship: { findFirst } } as unknown as PatientDirectoryDatabase;

    await expect(getPatientResponsibleOsm(osmActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toMatchObject({ status: "ASSIGNED", displayName: "สมใจ อสม." });
    await expect(getPatientResponsibleOsm(directoryActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toMatchObject({ status: "ASSIGNED", displayName: "สมใจ อสม." });

    const memberQuery = findFirst.mock.calls[1]?.[0];
    expect(memberQuery).toMatchObject({
      where: {
        id: relationshipId,
        hospitalId,
        OR: expect.arrayContaining([
          expect.objectContaining({
            endedAt: null,
            hospital: expect.objectContaining({
              memberships: {
                some: expect.objectContaining({
                  userId: directoryActor.userId,
                  membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
                  status: MembershipStatus.ACTIVE,
                }),
              },
            }),
          }),
        ]),
      },
    });
  });

  it.each([
    ["a Patient", { ...directoryActor, roles: [Role.PATIENT], hospitalMemberships: [] } as ActorContext],
    ["a routine Platform ADMIN", { ...directoryActor, roles: [Role.ADMIN], hospitalMemberships: [] } as ActorContext],
    ["a parent or other Hospital", {
      ...directoryActor,
      hospitalMemberships: [{
        hospitalId: "77777777-7777-4777-8777-777777777777",
        membershipType: MembershipType.OWNER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      }],
    } as ActorContext],
    ["a suspended direct Hospital MEMBER", {
      ...directoryActor,
      hospitalMemberships: [{
        ...directoryActor.hospitalMemberships[0],
        status: MembershipStatus.SUSPENDED,
      }],
    }],
  ] as const)("restricts current OSM visibility for %s without direct patient:read scope", async (_label, actor) => {
    const findFirst = vi.fn();
    const database = { patientHospitalRelationship: { findFirst } } as unknown as PatientDirectoryDatabase;

    await expect(getPatientResponsibleOsm(actor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toEqual({ status: "RESTRICTED" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("keeps OSM visibility bound to the actor's own current Patient assignment", async () => {
    const assignedAt = new Date("2026-10-01T00:00:00.000Z");
    const findFirst = vi.fn().mockResolvedValue({
      osmAssignments: [{
        createdAt: assignedAt,
        osmUser: {
          status: UserStatus.ACTIVE,
          roles: [{ role: Role.OSM }],
          person: { givenName: "สมใจ", familyName: "อสม." },
          osmHospitalRelationships: [{
            status: MembershipStatus.ACTIVE,
            hospital: { status: HospitalStatus.ACTIVE },
          }],
        },
      }],
    });
    const database = { patientHospitalRelationship: { findFirst } } as unknown as PatientDirectoryDatabase;

    await expect(getPatientResponsibleOsm(osmActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).resolves.toMatchObject({ status: "ASSIGNED", displayName: "สมใจ อสม." });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: relationshipId,
        hospitalId,
        OR: [expect.objectContaining({
          osmAssignments: expect.objectContaining({
            some: expect.objectContaining({ osmUserId: osmActor.userId, endedAt: null }),
          }),
        })],
      }),
    }));

    const unrelatedOsm: ActorContext = { ...osmActor, userId: "88888888-8888-4888-8888-888888888888" };
    const noMatch = vi.fn().mockResolvedValue(null);
    const noMatchDatabase = { patientHospitalRelationship: { findFirst: noMatch } } as unknown as PatientDirectoryDatabase;
    await expect(getPatientResponsibleOsm(unrelatedOsm, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database: noMatchDatabase })).rejects.toBeInstanceOf(NotFoundError);
    expect(noMatch).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [expect.objectContaining({
          osmAssignments: expect.objectContaining({
            some: expect.objectContaining({ osmUserId: unrelatedOsm.userId, endedAt: null }),
          }),
        })],
      }),
    }));
  });

  it("fails closed when the responsible OSM query fails", async () => {
    const findFirst = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const database = { patientHospitalRelationship: { findFirst } } as unknown as PatientDirectoryDatabase;

    await expect(getPatientResponsibleOsm(null, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).rejects.toBeInstanceOf(ForbiddenError);
    expect(findFirst).not.toHaveBeenCalled();

    await expect(getPatientResponsibleOsm(ownerActor, {
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
    }, { database })).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("lists assigned patients independently of Patient account status with exact scope and bounded paging", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: hospitalId, name: "โรงพยาบาลทดสอบ" });
    const count = vi.fn().mockResolvedValue(30);
    const findMany = vi.fn().mockResolvedValue([{
      id: relationshipId,
      hospitalNumber: "HN-001",
      selfRegisteredAt: null,
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      patientProfile: {
        id: patientProfileId,
        patientClassification: null,
        person: { givenName: "สมชาย", familyName: "ผู้ป่วย" },
      },
    }]);
    const database = {
      hospital: { findFirst },
      patientHospitalRelationship: { count, findMany },
    } as unknown as PatientDirectoryDatabase;

    const page = await findPatientsAssignedToOsmInHospital(ownerActor, {
      hospitalId,
      osmUserId: "66666666-6666-4666-8666-666666666666",
      page: "2",
    }, { database });

    expect(page).toMatchObject({
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      page: 2,
      pageSize: PATIENT_DIRECTORY_PAGE_SIZE,
      total: 30,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
      items: [{ patientHospitalRelationshipId: relationshipId, hospitalNumber: "HN-001" }],
    });
    expect(count).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: PATIENT_DIRECTORY_PAGE_SIZE,
      take: PATIENT_DIRECTORY_PAGE_SIZE,
      select: patientDirectoryInternals.workforceOsmPatientSelect,
      where: expect.objectContaining({
        endedAt: null,
        hospitalId,
        hospital: expect.objectContaining({ status: HospitalStatus.ACTIVE }),
        patientProfile: {
          person: {
            user: {
              roles: { some: { role: Role.PATIENT } },
            },
          },
        },
        osmAssignments: {
          some: expect.objectContaining({
            osmUserId: "66666666-6666-4666-8666-666666666666",
            endedAt: null,
            osmUser: expect.objectContaining({
              status: UserStatus.ACTIVE,
              roles: { some: { role: Role.OSM } },
              osmHospitalRelationships: {
                some: {
                  hospitalId,
                  status: MembershipStatus.ACTIVE,
                  hospital: { status: HospitalStatus.ACTIVE },
                },
              },
            }),
          }),
        },
      }),
    }));
    const queryWhere = findMany.mock.calls[0]?.[0].where;
    expect(queryWhere?.patientProfile?.person?.user).not.toHaveProperty("status");
    expect(count).toHaveBeenCalledWith({ where: queryWhere });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        memberships: { some: expect.objectContaining({ membershipType: { in: [MembershipType.OWNER] } }) },
      }),
    }));
  });

  it("requires OSM profile-read and direct patient-read scope for the same Hospital", async () => {
    const findFirst = vi.fn();
    const database = { hospital: { findFirst } } as unknown as PatientDirectoryDatabase;
    const unrelatedActor = { ...directoryActor, roles: [Role.PATIENT], hospitalMemberships: [] } as ActorContext;

    await expect(findPatientsAssignedToOsmInHospital(unrelatedActor, {
      hospitalId,
      osmUserId: "66666666-6666-4666-8666-666666666666",
      page: 1,
    }, { database })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(findPatientsAssignedToOsmInHospital(directoryActor, {
      hospitalId,
      osmUserId: "66666666-6666-4666-8666-666666666666",
      page: 1,
    }, { database })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(findPatientsAssignedToOsmInHospital(ownerActor, {
      hospitalId: "77777777-7777-4777-8777-777777777777",
      osmUserId: "66666666-6666-4666-8666-666666666666",
      page: 1,
    }, { database })).rejects.toBeInstanceOf(ForbiddenError);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("surfaces roster query failures instead of treating them as an empty list", async () => {
    const database = {
      hospital: {
        findFirst: vi.fn().mockResolvedValue({ id: hospitalId, name: "โรงพยาบาลทดสอบ" }),
      },
      patientHospitalRelationship: {
        count: vi.fn().mockRejectedValue(new Error("database unavailable")),
      },
    } as unknown as PatientDirectoryDatabase;

    await expect(findPatientsAssignedToOsmInHospital(ownerActor, {
      hospitalId,
      osmUserId: "66666666-6666-4666-8666-666666666666",
      page: 1,
    }, { database })).rejects.toBeInstanceOf(InfrastructureError);
  });
});
