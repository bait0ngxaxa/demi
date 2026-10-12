import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";
import { patientAssignedDirectoryQuerySchema } from "@/modules/patient-directory/schemas/patient-directory-schemas";

import {
  findAssignedPatientDirectory,
  getPatientDirectoryDetail,
  patientDirectoryInternals,
  type PatientDirectoryDatabase,
} from "./patient-directory-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const patientProfileId = "33333333-3333-4333-8333-333333333333";
const osmUserId = "44444444-4444-4444-8444-444444444444";

const osmActor: ActorContext = {
  userId: osmUserId,
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.OSM],
  hospitalMemberships: [],
  osmHospitalRelationships: [
    {
      hospitalId,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
};

function createDatabase(total: number): {
  database: PatientDirectoryDatabase;
  count: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
} {
  const count = vi.fn().mockResolvedValue(total);
  const findMany = vi.fn().mockResolvedValue([
    {
      id: relationshipId,
      hospitalNumber: "HN-001",
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      patientProfile: {
        id: patientProfileId,
        person: { givenName: "สมชาย", familyName: "ผู้ป่วย" },
      },
    },
  ]);

  return {
    database: {
      patientHospitalRelationship: { count, findMany },
    } as unknown as PatientDirectoryDatabase,
    count,
    findMany,
  };
}

describe("assigned Patient directory query boundary", () => {
  it("returns an empty authorized roster without assuming assignment acceptance or pending work", async () => {
    const { database, findMany } = createDatabase(0);
    findMany.mockResolvedValue([]);
    const result = await findAssignedPatientDirectory(osmActor, { lookupType: "NAME", value: "", page: "1" }, { database });
    expect(result).toMatchObject({ items: [], total: 0, totalPages: 1, page: 1 });
    expect(result.hasNextPage).toBe(false);
  });

  it.each([
    { status: MembershipStatus.SUSPENDED, hospitalStatus: HospitalStatus.ACTIVE },
    { status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.SUSPENDED },
  ])("rejects inactive association/Hospital before loading patients: $status / $hospitalStatus", async (scope) => {
    const { database, count, findMany } = createDatabase(0);
    await expect(findAssignedPatientDirectory({ ...osmActor, osmHospitalRelationships: [{ hospitalId, ...scope }] }, { lookupType: "NAME", value: "", page: "1" }, { database })).rejects.toBeInstanceOf(ForbiddenError);
    expect(count).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("uses the same assignment predicate for count and rows with filters for multi-role/multi-Hospital OSM", async () => {
    const { database, count, findMany } = createDatabase(26);
    await findAssignedPatientDirectory({
      ...osmActor,
      roles: [Role.OSM, Role.PATIENT],
      osmHospitalRelationships: [...osmActor.osmHospitalRelationships, { hospitalId: "66666666-6666-4666-8666-666666666666", status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    }, { lookupType: "NAME", value: "สมชาย", page: "2", classification: "RISK" }, { database });
    const [query] = findMany.mock.calls[0] ?? [];
    expect(count).toHaveBeenCalledWith({ where: query.where });
    expect(query).toMatchObject({ skip: 25, take: 25, where: {
      patientProfile: { patientClassification: { is: { classification: "RISK" } }, person: { AND: [{ OR: [
        { givenName: { contains: "สมชาย", mode: "insensitive" } },
        { familyName: { contains: "สมชาย", mode: "insensitive" } },
      ] }] } },
      osmAssignments: { some: { osmUserId, endedAt: null } },
      hospital: { status: HospitalStatus.ACTIVE, osmHospitalRelationships: { some: { userId: osmUserId, status: MembershipStatus.ACTIVE } } },
    } });
  });

  it("fails closed for crafted relationships and keeps ended assignments outside the detail predicate", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const database = { patientHospitalRelationship: { findFirst } } as unknown as PatientDirectoryDatabase;
    await expect(getPatientDirectoryDetail({ ...osmActor, roles: [Role.OSM, Role.PATIENT] }, relationshipId, { database })).rejects.toBeInstanceOf(NotFoundError);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: relationshipId,
      OR: [expect.objectContaining({
        hospital: expect.objectContaining({ status: HospitalStatus.ACTIVE }),
        osmAssignments: { some: expect.objectContaining({ osmUserId, endedAt: null }) },
      })],
    } }));
  });

  it("keeps the assigned query bounded and clamps a very large page", async () => {
    const { database, count, findMany } = createDatabase(30_000);

    const result = await findAssignedPatientDirectory(
      osmActor,
      {
        lookupType: "NAME",
        value: "",
        page: String(Number.MAX_SAFE_INTEGER),
      },
      { database },
    );

    expect(result).toMatchObject({
      page: 1_200,
      total: 30_000,
      totalPages: 1_200,
      hasNextPage: false,
    });
    expect(count).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 29_975,
        take: 25,
      }),
    );
  });

  it("constrains the database predicate to the current assignment and OSM relationship", async () => {
    const { database, findMany } = createDatabase(1);

    await findAssignedPatientDirectory(
      osmActor,
      {
        lookupType: "HOSPITAL_NUMBER",
        value: "HN-001",
        page: "1",
      },
      { database },
    );

    const [query] = findMany.mock.calls[0] ?? [];
    expect(query.where).toMatchObject({
      hospital: {
        status: HospitalStatus.ACTIVE,
        osmHospitalRelationships: {
          some: {
            userId: osmUserId,
            status: MembershipStatus.ACTIVE,
            user: {
              status: "ACTIVE",
              roles: { some: { role: Role.OSM } },
            },
          },
        },
      },
      osmAssignments: {
        some: {
          osmUserId,
          endedAt: null,
          osmUser: {
            status: "ACTIVE",
            roles: { some: { role: Role.OSM } },
          },
        },
      },
      hospitalNumber: "HN-001",
    });
    expect(query.select).toEqual(patientDirectoryInternals.patientDirectorySelect);
  });

  it("returns only the minimal Patient projection", async () => {
    const { database } = createDatabase(1);
    const result = await findAssignedPatientDirectory(
      osmActor,
      { lookupType: "NAME", value: "สมชาย", page: "1" },
      { database },
    );

    expect(result.items[0]).toEqual({
      patientProfileId,
      patientHospitalRelationshipId: relationshipId,
      displayName: "สมชาย ผู้ป่วย",
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      hospitalNumber: "HN-001",
      classification: null,
    });
    expect(JSON.stringify(result)).not.toContain("identityKeyHash");
    expect(JSON.stringify(result)).not.toContain("authSubject");
    expect(JSON.stringify(result)).not.toContain("activation");
    expect(JSON.stringify(result)).not.toContain("clinical");
  });

  it("rejects an unbounded search value and a non-OSM actor", async () => {
    expect(
      patientAssignedDirectoryQuerySchema.safeParse({
        lookupType: "NAME",
        value: "x".repeat(121),
        page: "1",
      }).success,
    ).toBe(false);

    await expect(
      findAssignedPatientDirectory(
        {
          ...osmActor,
          roles: [Role.HOSPITAL],
          osmHospitalRelationships: [],
          hospitalMemberships: [
            {
              hospitalId,
              membershipType: MembershipType.MEMBER,
              profession: null,
              status: MembershipStatus.ACTIVE,
              hospitalStatus: HospitalStatus.ACTIVE,
            },
          ],
        },
        { lookupType: "NAME", value: "", page: "1" },
        { database: createDatabase(0).database },
      ),
    ).rejects.toThrow();
  });
});
