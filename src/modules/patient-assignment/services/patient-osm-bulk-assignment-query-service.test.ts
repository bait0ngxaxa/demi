import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, ValidationError } from "@/shared/errors/application-error";

import {
  getPatientOsmBulkAssignmentView,
  listPatientOsmAssignmentScopes,
  listPatientOsmBulkCandidates,
  type PatientOsmAssignmentQueryDatabase,
} from "./patient-osm-assignment-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";
const ownerUserId = "33333333-3333-4333-8333-333333333333";

function actorWith(
  membershipType: MembershipType,
  targetHospitalId = hospitalId,
  status: MembershipStatus = MembershipStatus.ACTIVE,
): ActorContext {
  return {
    userId: ownerUserId,
    personId: "44444444-4444-4444-8444-444444444444",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId: targetHospitalId,
        membershipType,
        profession: null,
        status,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
  };
}

function createDatabase(options: { hospitalFound?: boolean } = {}) {
  const hospital = {
    findFirst: vi.fn(async () => (options.hospitalFound === false ? null : { id: hospitalId, name: "โรงพยาบาล ก" })),
    findMany: vi.fn(async () => [{ id: hospitalId, name: "โรงพยาบาล ก" }, { id: otherHospitalId, name: "โรงพยาบาล ข" }]),
  };
  const patientHospitalRelationship = {
    findMany: vi.fn(async () => [
      {
        id: "55555555-5555-4555-8555-555555555555",
        hospitalNumber: "HN-1",
        hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
        patientProfile: {
          id: "66666666-6666-4666-8666-666666666666",
          patientClassification: { classification: "RISK" },
          person: { givenName: "สมชาย", familyName: "ผู้ป่วย" },
        },
      },
    ]),
    count: vi.fn(async () => 731),
  };
  const user = {
    findMany: vi.fn(async () => [
      { id: "77777777-7777-4777-8777-777777777777", osmHospitalRelationships: [{ contactPhone: "0812345678" }], person: { givenName: "สมหญิง", familyName: "ผู้ดูแล" } },
    ]),
    count: vi.fn(async () => 1),
  };

  return {
    database: { hospital, patientHospitalRelationship, user } as unknown as PatientOsmAssignmentQueryDatabase,
    hospital,
    patientHospitalRelationship,
    user,
  };
}

describe("listPatientOsmAssignmentScopes", () => {
  it("lists only hospitals the actor actively owns", async () => {
    const { database } = createDatabase();
    const scopes = await listPatientOsmAssignmentScopes(actorWith(MembershipType.OWNER), { database });

    expect(scopes).toEqual([{ hospitalId, hospitalName: "โรงพยาบาล ก" }]);
  });

  it("lists the Hospital for an ACTIVE MEMBER (ADR-0026) and nothing for a SUSPENDED one", async () => {
    const { database } = createDatabase();

    expect(await listPatientOsmAssignmentScopes(actorWith(MembershipType.MEMBER), { database })).toEqual([
      { hospitalId, hospitalName: "โรงพยาบาล ก" },
    ]);
    expect(
      await listPatientOsmAssignmentScopes(actorWith(MembershipType.MEMBER, hospitalId, MembershipStatus.SUSPENDED), { database }),
    ).toEqual([]);
  });

  it("fails closed without an actor", async () => {
    await expect(listPatientOsmAssignmentScopes(null)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

type PatientPageQuery = { where: Record<string, unknown>; orderBy: unknown; skip: number; take: number };

function patientPageQuery(findMany: { mock: { calls: unknown[][] } }, call = 0): PatientPageQuery {
  return findMany.mock.calls[call]?.[0] as PatientPageQuery;
}

describe("getPatientOsmBulkAssignmentView", () => {
  it("returns the first page of unassigned patients and the full total, without loading OSMs", async () => {
    const { database, patientHospitalRelationship, user } = createDatabase();
    const view = await getPatientOsmBulkAssignmentView(
      actorWith(MembershipType.OWNER),
      { hospitalId, value: "สม" },
      { database },
    );

    expect(view.hospital).toEqual({ hospitalId, hospitalName: "โรงพยาบาล ก" });
    expect(view.totalWithoutOsm).toBe(731);
    expect(view).toMatchObject({ page: 1, pageSize: 25, totalPages: 30, hasPreviousPage: false, hasNextPage: true });
    expect(view.patients).toEqual([
      expect.objectContaining({ displayName: "สมชาย ผู้ป่วย", hospitalNumber: "HN-1" }),
    ]);
    const patientQuery = patientPageQuery(patientHospitalRelationship.findMany);
    expect(patientQuery).toMatchObject({ skip: 0, take: 25 });
    expect(patientQuery.where).toMatchObject({
      hospitalId,
      osmAssignments: { none: { endedAt: null } },
    });
    expect(JSON.stringify(patientQuery.where)).toContain("PATIENT");
    expect(JSON.stringify(patientQuery.where)).toContain("สม");
    expect(user.findMany).not.toHaveBeenCalled();
  });

  it("pages with the same filter, count and stable order: page 2 and the last page", async () => {
    const { database, patientHospitalRelationship } = createDatabase();
    const actor = actorWith(MembershipType.OWNER);

    const second = await getPatientOsmBulkAssignmentView(actor, { hospitalId, value: "สม", page: 2 }, { database });
    const last = await getPatientOsmBulkAssignmentView(actor, { hospitalId, value: "สม", page: "30" }, { database });

    expect(second).toMatchObject({ page: 2, totalPages: 30, hasPreviousPage: true, hasNextPage: true, totalWithoutOsm: 731 });
    expect(last).toMatchObject({ page: 30, totalPages: 30, hasPreviousPage: true, hasNextPage: false, totalWithoutOsm: 731 });
    const secondQuery = patientPageQuery(patientHospitalRelationship.findMany);
    const lastQuery = patientPageQuery(patientHospitalRelationship.findMany, 1);
    expect(secondQuery).toMatchObject({ skip: 25, take: 25 });
    expect(lastQuery).toMatchObject({ skip: 725, take: 25 });
    expect(lastQuery.where).toEqual(secondQuery.where);
    expect(lastQuery.orderBy).toEqual([
      { patientProfile: { person: { givenName: "asc" } } },
      { patientProfile: { person: { familyName: "asc" } } },
      { id: "asc" },
    ]);
    const countCalls = patientHospitalRelationship.count.mock.calls as unknown as Array<[{ where: unknown }]>;
    expect(countCalls.map(([query]) => query.where)).toEqual([secondQuery.where, secondQuery.where]);
  });

  it("clamps a page past the end to the last page, and to page 1 when nothing matches", async () => {
    const { database, patientHospitalRelationship } = createDatabase();
    const actor = actorWith(MembershipType.OWNER);

    const beyond = await getPatientOsmBulkAssignmentView(actor, { hospitalId, page: 99 }, { database });
    expect(beyond).toMatchObject({ page: 30, totalPages: 30, hasNextPage: false });
    expect(patientPageQuery(patientHospitalRelationship.findMany)).toMatchObject({ skip: 725 });

    patientHospitalRelationship.count.mockResolvedValueOnce(0);
    patientHospitalRelationship.findMany.mockResolvedValueOnce([]);
    const empty = await getPatientOsmBulkAssignmentView(actor, { hospitalId, page: 4 }, { database });
    expect(empty).toMatchObject({ page: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false, totalWithoutOsm: 0 });
    expect(patientPageQuery(patientHospitalRelationship.findMany, 1)).toMatchObject({ skip: 0 });
  });

  it("rejects a malformed page", async () => {
    const { database, patientHospitalRelationship } = createDatabase();

    for (const page of [0, -1, 1.5, "abc"]) {
      await expect(
        getPatientOsmBulkAssignmentView(actorWith(MembershipType.OWNER), { hospitalId, page }, { database }),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    expect(patientHospitalRelationship.findMany).not.toHaveBeenCalled();
  });

  it("denies a SUSPENDED MEMBER before querying", async () => {
    const { database, patientHospitalRelationship } = createDatabase();

    await expect(
      getPatientOsmBulkAssignmentView(actorWith(MembershipType.MEMBER, hospitalId, MembershipStatus.SUSPENDED), { hospitalId }, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(patientHospitalRelationship.findMany).not.toHaveBeenCalled();
  });

  it("denies an owner of a different hospital", async () => {
    const { database, patientHospitalRelationship } = createDatabase();

    await expect(
      getPatientOsmBulkAssignmentView(
        actorWith(MembershipType.OWNER, otherHospitalId),
        { hospitalId },
        { database },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(patientHospitalRelationship.findMany).not.toHaveBeenCalled();
  });

  it("denies when the hospital is not found for the owner", async () => {
    const { database, patientHospitalRelationship } = createDatabase({ hospitalFound: false });

    await expect(
      getPatientOsmBulkAssignmentView(actorWith(MembershipType.OWNER), { hospitalId }, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(patientHospitalRelationship.findMany).not.toHaveBeenCalled();
  });

  it("rejects malformed input and a missing actor", async () => {
    const { database } = createDatabase();

    await expect(
      getPatientOsmBulkAssignmentView(actorWith(MembershipType.OWNER), { hospitalId: "x" }, { database }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(getPatientOsmBulkAssignmentView(null, { hospitalId }, { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("listPatientOsmBulkCandidates", () => {
  const osmRecord = (index: number) => ({
    osmHospitalRelationships: [{ contactPhone: "0812345678" }],
    id: `77777777-7777-4777-8777-${String(index).padStart(12, "0")}`,
    person: { givenName: `อสม.${index}`, familyName: "ผู้ดูแล" },
  });
  type CandidateQuery = { where: Record<string, unknown>; orderBy: unknown; skip: number; take: number };
  const candidateQuery = (user: { findMany: { mock: { calls: unknown[][] } } }, call = 0): CandidateQuery =>
    user.findMany.mock.calls[call]?.[0] as CandidateQuery;

  it("returns page 1 of eligible OSMs of the owned hospital, excluding the actor, and filters by name", async () => {
    const { database, user, hospital } = createDatabase();

    const page = await listPatientOsmBulkCandidates(
      actorWith(MembershipType.OWNER),
      { hospitalId, value: "สมหญิง" },
      { database },
    );

    expect(page).toEqual({
      candidates: [{ userId: "77777777-7777-4777-8777-777777777777", displayName: "สมหญิง ผู้ดูแล", contactPhone: "0812345678" }],
      page: 1,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
    expect(JSON.stringify((hospital.findFirst.mock.calls as unknown as unknown[][])[0]?.[0])).toContain("OWNER");

    const query = candidateQuery(user);
    expect(query.where).toMatchObject({
      status: UserStatus.ACTIVE,
      id: { notIn: [ownerUserId] },
      osmHospitalRelationships: { some: { hospitalId, status: MembershipStatus.ACTIVE } },
    });
    expect(JSON.stringify(query.where)).toContain("สมหญิง");
    expect(query).toMatchObject({ skip: 0, take: 10 });
    const countQuery = (user.count.mock.calls as unknown as Array<[{ where: unknown }]>)[0]?.[0];
    expect(countQuery?.where).toEqual(query.where);
  });

  it("pages 10 at a time under the same filter and deterministic order", async () => {
    const { database, user } = createDatabase();
    user.count.mockResolvedValue(23);
    user.findMany.mockResolvedValueOnce(Array.from({ length: 10 }, (_, index) => osmRecord(index + 11)));

    const second = await listPatientOsmBulkCandidates(
      actorWith(MembershipType.OWNER),
      { hospitalId, value: "สม", page: 2 },
      { database },
    );

    expect(second).toMatchObject({ page: 2, totalPages: 3, hasPreviousPage: true, hasNextPage: true });
    expect(second.candidates).toHaveLength(10);
    expect(candidateQuery(user)).toMatchObject({
      skip: 10,
      take: 10,
      orderBy: [{ person: { givenName: "asc" } }, { person: { familyName: "asc" } }, { id: "asc" }],
    });
    expect(JSON.stringify(candidateQuery(user).where)).toContain(hospitalId);
    expect(JSON.stringify(candidateQuery(user).where)).toContain("สม");
  });

  it("clamps a page past the end to the last page, and to page 1 when no OSM matches", async () => {
    const { database, user } = createDatabase();
    user.count.mockResolvedValueOnce(23);

    const beyond = await listPatientOsmBulkCandidates(actorWith(MembershipType.OWNER), { hospitalId, page: 9 }, { database });
    expect(beyond).toMatchObject({ page: 3, totalPages: 3, hasNextPage: false, hasPreviousPage: true });
    expect(candidateQuery(user)).toMatchObject({ skip: 20, take: 10 });

    user.count.mockResolvedValueOnce(0);
    user.findMany.mockResolvedValueOnce([]);
    const none = await listPatientOsmBulkCandidates(actorWith(MembershipType.OWNER), { hospitalId, value: "ไม่มี", page: 3 }, { database });
    expect(none).toEqual({ candidates: [], page: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false });
    expect(candidateQuery(user, 1)).toMatchObject({ skip: 0 });
  });

  it("re-authorizes on a later page: a SUSPENDED MEMBER is denied before any query", async () => {
    const { database, user } = createDatabase();

    await expect(
      listPatientOsmBulkCandidates(
        actorWith(MembershipType.MEMBER, hospitalId, MembershipStatus.SUSPENDED),
        { hospitalId, page: 2 },
        { database },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(user.count).not.toHaveBeenCalled();
    expect(user.findMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed page and the removed cursor field before querying", async () => {
    const { database, user } = createDatabase();

    await expect(
      listPatientOsmBulkCandidates(actorWith(MembershipType.OWNER), { hospitalId, page: 0 }, { database }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      listPatientOsmBulkCandidates(
        actorWith(MembershipType.OWNER),
        { hospitalId, cursor: "88888888-8888-4888-8888-888888888888" },
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(user.findMany).not.toHaveBeenCalled();
  });

  it("denies a MEMBER, an unowned hospital, a missing actor and malformed input before querying OSMs", async () => {
    const { database, user } = createDatabase({ hospitalFound: false });

    await expect(
      listPatientOsmBulkCandidates(actorWith(MembershipType.MEMBER), { hospitalId }, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      listPatientOsmBulkCandidates(actorWith(MembershipType.OWNER), { hospitalId }, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listPatientOsmBulkCandidates(null, { hospitalId }, { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      listPatientOsmBulkCandidates(actorWith(MembershipType.OWNER), { hospitalId: "x" }, { database }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(user.findMany).not.toHaveBeenCalled();
  });
});
