import {
  FollowupActivityProgressStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Role,
  type PrismaClient,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

const mockedResolveAccess = vi.hoisted(() => vi.fn());
const mockedResolveGlobalAccess = vi.hoisted(() => vi.fn());
vi.mock("./hospital-report-access-service", () => ({
  resolveHospitalReportingAccessContext: mockedResolveAccess,
}));
vi.mock("./global-reporting-access-service", () => ({
  resolveGlobalReportingAccessContext: mockedResolveGlobalAccess,
}));

import {
  HospitalReportExportLimitError,
  getGlobalAdminHospitalReportingPage,
  getHospitalReportingPage,
  hospitalReportQueryInternals,
} from "./hospital-report-query-service";
import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";

const hospitalAId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";
const programA1Id = "44444444-4444-4444-8444-444444444444";
const programA2Id = "55555555-5555-4555-8555-555555555555";
const programA3Id = "88888888-8888-4888-8888-000000000003";
const actorBUserId = "99999999-9999-4999-8999-999999999999";
const hospitalBId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const startedAt = new Date("2026-08-17T05:00:00.000Z");
const cursorSecret = "synthetic-hospital-reporting-cursor-secret";

const actor: ActorContext = {
  userId: actorUserId,
  personId: "66666666-6666-4666-8666-666666666666",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{
    hospitalId: hospitalAId,
    membershipType: MembershipType.OWNER,
    profession: null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
  osmHospitalRelationships: [],
};

const access = {
  actor,
  hospital: { id: hospitalAId, hospitalCode: "DEMO-A", name: "โรงพยาบาล ก", status: HospitalStatus.ACTIVE },
};
const actorB: ActorContext = { ...actor, userId: actorBUserId };
const accessForActorB = { actor: actorB, hospital: access.hospital };
const actorWithBothHospitals: ActorContext = {
  ...actorB,
  hospitalMemberships: [
    ...actorB.hospitalMemberships,
    {
      hospitalId: hospitalBId,
      membershipType: MembershipType.OWNER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
};
const accessForBothHospitalsA = { actor: actorWithBothHospitals, hospital: access.hospital };
const accessForBothHospitalsB = {
  actor: actorWithBothHospitals,
  hospital: { id: hospitalBId, hospitalCode: "DEMO-B", name: "โรงพยาบาล ข", status: HospitalStatus.ACTIVE },
};
const globalActor: ActorContext = { ...actorWithBothHospitals, roles: [Role.ADMIN, Role.HOSPITAL] };

function followupRecord(roundNumber: number): Record<string, unknown> {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(roundNumber).padStart(12, "0")}`,
    roundNumber,
    recordedAt: new Date(`2026-08-${String(17 + roundNumber).padStart(2, "0")}T05:00:00.000Z`),
    weight: null,
    waistCircumference: null,
    systolicBloodPressure: 0,
    diastolicBloodPressure: null,
    bloodSugar: roundNumber,
    sourceGoalPlan: { templateKey: "demi-goals", templateVersion: "legacy-prototype-v1" },
    activityProgress: [{ goalActivityCode: "exercise_walk", status: FollowupActivityProgressStatus.PARTIAL }],
  };
}

function programRecord(input: {
  id: string;
  status: PatientProgramStatus;
  followupCount?: number;
  baseline?: Record<string, unknown> | null;
  finalAssessment?: Record<string, unknown> | null;
  hospitalNumber?: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    patientHospitalRelationshipId: relationshipId,
    status: input.status,
    startedAt,
    completedAt: input.status === PatientProgramStatus.COMPLETED ? new Date("2026-09-01T05:00:00.000Z") : null,
    patientHospitalRelationship: {
      id: relationshipId,
      hospitalNumber: input.hospitalNumber ?? "HOSP-A-01",
      patientProfile: { person: { givenName: "สมชาย", familyName: "ใจดี" } },
      osmAssignments: [],
    },
    initialBaseline: input.baseline === undefined ? {
      id: "77777777-7777-4777-8777-777777777777",
      recordedOn: new Date("2026-08-16T00:00:00.000Z"),
      weight: 0,
      heightCm: null,
      waistCircumference: null,
      bloodPressureSystolic: 120,
      bloodPressureDiastolic: null,
      bloodSugarDtx: null,
    } : input.baseline,
    serviceOneRoutine: null,
    serviceOneFloatingChart: null,
    serviceOneDreamCard: null,
    serviceOneConfidence: null,
    finalAssessment: input.finalAssessment ?? null,
    goalPlans: [],
    followups: Array.from({ length: input.followupCount ?? 0 }, (_, index) => followupRecord(index + 1)),
  };
}

function createDatabase(input: {
  programs?: Record<string, unknown>[];
  relationshipCount?: number;
  relationshipsWithoutProgram?: number;
  followupCount?: number;
  goalPlanCount?: number;
} = {}): PrismaClient & {
  patientProgram: { findMany: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
  patientHospitalRelationship: { count: ReturnType<typeof vi.fn> };
  patientGoalPlan: { groupBy: ReturnType<typeof vi.fn> };
  patientFollowup: { groupBy: ReturnType<typeof vi.fn> };
} {
  const database = {
    patientProgram: {
      findMany: vi.fn().mockResolvedValue(input.programs ?? []),
      groupBy: vi.fn().mockResolvedValue([
        { status: PatientProgramStatus.ACTIVE, _count: { _all: 1 } },
        { status: PatientProgramStatus.COMPLETED, _count: { _all: 1 } },
      ]),
    },
    patientHospitalRelationship: {
      count: vi.fn()
        .mockResolvedValueOnce(input.relationshipCount ?? 2)
        .mockResolvedValueOnce(input.relationshipsWithoutProgram ?? 1),
    },
    patientGoalPlan: {
      groupBy: vi.fn().mockResolvedValue(
        input.goalPlanCount ? [{ patientProgramId: programA1Id, _count: { _all: input.goalPlanCount } }] : [],
      ),
    },
    patientFollowup: {
      groupBy: vi.fn().mockResolvedValue(
        input.followupCount ? [{ patientProgramId: programA1Id, _count: { _all: input.followupCount } }] : [],
      ),
    },
  };
  return database as unknown as PrismaClient & typeof database;
}

describe("Hospital reporting query service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMI_HOSPITAL_REPORTING_CURSOR_SECRET", cursorSecret);
    mockedResolveAccess.mockResolvedValue(access);
    mockedResolveGlobalAccess.mockResolvedValue({ actor: globalActor, hospital: access.hospital });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses an exact Hospital predicate and keeps separate Program rows under one relationship", async () => {
    const first = programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE, followupCount: 6 });
    const second = programRecord({
      id: programA2Id,
      status: PatientProgramStatus.COMPLETED,
      baseline: null,
      finalAssessment: null,
    });
    const database = createDatabase({
      programs: [first, second],
      followupCount: 7,
      relationshipCount: 2,
      relationshipsWithoutProgram: 1,
    });

    const result = await getHospitalReportingPage(actor, { hospitalId: hospitalAId }, { database });

    expect(result.page.items.map((item) => item.patientProgramId)).toEqual([programA1Id, programA2Id]);
    expect(result.page.items[0]?.patientHospitalRelationshipId).toBe(relationshipId);
    expect(result.page.items[1]?.patientHospitalRelationshipId).toBe(relationshipId);
    expect(result.counts).toEqual({
      patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 2 },
      relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 1 },
      programs: { grain: "PATIENT_PROGRAM", total: 2, active: 1, completed: 1 },
    });
    expect(result.page.items[0]?.baseline).toMatchObject({
      state: "PRESENT",
      value: { measurements: { weight: { state: "RECORDED", value: 0 }, bloodSugar: { state: "NOT_RECORDED" } } },
    });
    expect(result.page.items[1]?.baseline).toEqual({ state: "MISSING" });
    expect(result.page.items[1]?.finalAssessment).toEqual({ state: "MISSING" });
    expect(result.page.items[1]?.goalPlans).toMatchObject({ totalCount: 0, items: [], hasMore: false });
    expect(result.page.items[1]?.followups).toMatchObject({ totalCount: 0, items: [], hasMore: false });
    expect(result.page.items[0]?.followups.items[0]?.activityProgress[0]?.activityLabel).toBe("เดินออกกำลังกาย");
    expect(database.patientProgram.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        patientHospitalRelationship: { is: { hospitalId: hospitalAId } },
        status: { in: [PatientProgramStatus.ACTIVE, PatientProgramStatus.COMPLETED] },
      }),
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    }));
    expect(database.patientGoalPlan.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        patientHospitalRelationship: { hospitalId: hospitalAId },
        patientProgramId: { in: [programA1Id, programA2Id] },
      }),
    }));
    expect(JSON.stringify(result)).toContain("givenName");
    expect(JSON.stringify(result)).not.toContain("createdBy");
  });

  it("reuses the exact-Hospital projection for the separately authorized Global caller", async () => {
    const database = createDatabase({
      programs: [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE })],
    });

    const result = await getGlobalAdminHospitalReportingPage(
      globalActor,
      { hospitalId: hospitalAId },
      { database },
    );

    expect(result.page.items.map(({ patientProgramId }) => patientProgramId)).toEqual([programA1Id]);
    expect(database.patientProgram.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        patientHospitalRelationship: { is: { hospitalId: hospitalAId } },
        status: { in: [PatientProgramStatus.ACTIVE, PatientProgramStatus.COMPLETED] },
      }),
    }));
    expect(mockedResolveGlobalAccess).toHaveBeenCalledWith(
      globalActor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospitalAId,
      expect.anything(),
    );
    expect(mockedResolveAccess).not.toHaveBeenCalled();
  });

  it("binds pagination cursors to the authorization operation as well as actor and Hospital", async () => {
    const globalDatabase = createDatabase({
      programs: [
        programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE }),
        programRecord({ id: programA2Id, status: PatientProgramStatus.ACTIVE }),
      ],
    });
    const globalFirstPage = await getGlobalAdminHospitalReportingPage(
      globalActor,
      { hospitalId: hospitalAId, pageSize: 1 },
      { database: globalDatabase },
    );
    const globalCursor = globalFirstPage.page.nextCursor;
    if (!globalCursor) throw new Error("Expected a Global Reporting cursor");

    await expect(getHospitalReportingPage(globalActor, {
      hospitalId: hospitalAId,
      pageSize: 1,
      cursor: globalCursor,
    }, { database: createDatabase() })).rejects.toBeInstanceOf(NotFoundError);

    const ownerDatabase = createDatabase({
      programs: [
        programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE }),
        programRecord({ id: programA2Id, status: PatientProgramStatus.ACTIVE }),
      ],
    });
    const ownerFirstPage = await getHospitalReportingPage(
      globalActor,
      { hospitalId: hospitalAId, pageSize: 1 },
      { database: ownerDatabase },
    );
    const ownerCursor = ownerFirstPage.page.nextCursor;
    if (!ownerCursor) throw new Error("Expected a Hospital OWNER cursor");

    await expect(getGlobalAdminHospitalReportingPage(globalActor, {
      hospitalId: hospitalAId,
      pageSize: 1,
      cursor: ownerCursor,
    }, { database: createDatabase() })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps preview pagination explicit and uses deterministic cursor ordering", async () => {
    const programs = [1, 2, 3].map((index) => programRecord({
      id: index === 1 ? programA1Id : index === 2 ? programA2Id : "88888888-8888-4888-8888-000000000003",
      status: PatientProgramStatus.ACTIVE,
      followupCount: index === 1 ? 6 : 0,
    }));
    const database = createDatabase({ programs, followupCount: 7 });

    const result = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 2 }, { database });

    expect(result.page.items).toHaveLength(2);
    expect(result.page.items[0]?.followups).toMatchObject({ totalCount: 7, items: expect.any(Array), hasMore: true });
    expect(result.page.nextCursor).toBeTruthy();
    expect(database.patientProgram.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    expect(database.patientProgram.findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: { followups: { take: 6 }, goalPlans: { take: 3 } },
    });
  });

  it("continues with a valid signed cursor using the same Hospital, actor, page size, and ordering", async () => {
    const firstDatabase = createDatabase({
      programs: [
        programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE }),
        programRecord({ id: programA2Id, status: PatientProgramStatus.ACTIVE }),
      ],
    });
    const firstPage = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 1 }, { database: firstDatabase });
    const cursor = firstPage.page.nextCursor;
    expect(cursor).toBeTruthy();

    const secondDatabase = createDatabase({
      programs: [programRecord({ id: programA3Id, status: PatientProgramStatus.COMPLETED })],
    });
    const secondPage = await getHospitalReportingPage(
      actor,
      { hospitalId: hospitalAId, pageSize: 1, cursor: cursor ?? undefined },
      { database: secondDatabase },
    );

    expect(secondPage.page.items.map(({ patientProgramId }) => patientProgramId)).toEqual([programA3Id]);
    expect(secondDatabase.patientProgram.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        patientHospitalRelationship: { is: { hospitalId: hospitalAId } },
        OR: [
          { startedAt: { lt: startedAt } },
          { startedAt, id: { lt: programA1Id } },
        ],
      }),
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    }));
  });

  it("rejects a cursor with a changed signature", async () => {
    const database = createDatabase({
      programs: [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE }), programRecord({ id: programA2Id, status: PatientProgramStatus.ACTIVE })],
    });
    const firstPage = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 1 }, { database });
    const cursor = firstPage.page.nextCursor;
    if (!cursor) throw new Error("Expected a continuation cursor");
    const [payload, signature] = cursor.split(".");
    if (!payload || !signature) throw new Error("Expected a signed cursor format");
    const alteredSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;

    await expect(getHospitalReportingPage(actor, {
      hospitalId: hospitalAId,
      pageSize: 1,
      cursor: `${payload}.${alteredSignature}`,
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a non-canonical base64url signature", async () => {
    const database = createDatabase({
      programs: [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE }), programRecord({ id: programA2Id, status: PatientProgramStatus.ACTIVE })],
    });
    const firstPage = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 1 }, { database });
    const cursor = firstPage.page.nextCursor;
    if (!cursor) throw new Error("Expected a continuation cursor");
    const [payload, signature] = cursor.split(".");
    if (!payload || !signature) throw new Error("Expected a signed cursor format");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const finalCharacter = signature.at(-1);
    if (!finalCharacter) throw new Error("Expected a cursor signature");
    const finalIndex = alphabet.indexOf(finalCharacter);
    const nonCanonicalCharacter = alphabet[(finalIndex & ~3) | ((finalIndex + 1) & 3)];
    if (!nonCanonicalCharacter) throw new Error("Expected a base64url character");

    await expect(getHospitalReportingPage(actor, {
      hospitalId: hospitalAId,
      pageSize: 1,
      cursor: `${payload}.${signature.slice(0, -1)}${nonCanonicalCharacter}`,
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects cursors issued for a different Hospital, actor, or page size", async () => {
    const database = createDatabase({
      programs: [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE }), programRecord({ id: programA2Id, status: PatientProgramStatus.ACTIVE })],
    });
    mockedResolveAccess.mockResolvedValue(accessForBothHospitalsA);
    const multiHospitalFirstPage = await getHospitalReportingPage(actorWithBothHospitals, {
      hospitalId: hospitalAId,
      pageSize: 1,
    }, { database });
    const multiHospitalCursor = multiHospitalFirstPage.page.nextCursor;
    if (!multiHospitalCursor) throw new Error("Expected a continuation cursor");

    mockedResolveAccess.mockResolvedValue(accessForBothHospitalsB);
    await expect(getHospitalReportingPage(actorWithBothHospitals, {
      hospitalId: hospitalBId,
      pageSize: 1,
      cursor: multiHospitalCursor,
    }, { database })).rejects.toBeInstanceOf(NotFoundError);

    mockedResolveAccess.mockResolvedValue(access);
    const firstPage = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 1 }, { database });
    const cursor = firstPage.page.nextCursor;
    if (!cursor) throw new Error("Expected a continuation cursor");

    mockedResolveAccess.mockResolvedValue(accessForActorB);
    await expect(getHospitalReportingPage(actorB, {
      hospitalId: hospitalAId,
      pageSize: 1,
      cursor,
    }, { database })).rejects.toBeInstanceOf(NotFoundError);

    mockedResolveAccess.mockResolvedValue(access);
    await expect(getHospitalReportingPage(actor, {
      hospitalId: hospitalAId,
      pageSize: 2,
      cursor,
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects expired and malformed cursors", async () => {
    const database = createDatabase({
      programs: [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE }), programRecord({ id: programA2Id, status: PatientProgramStatus.ACTIVE })],
    });
    const firstPage = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 1 }, { database });
    const cursor = firstPage.page.nextCursor;
    if (!cursor) throw new Error("Expected a continuation cursor");

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60 * 1000);
    await expect(getHospitalReportingPage(actor, {
      hospitalId: hospitalAId,
      pageSize: 1,
      cursor,
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
    vi.restoreAllMocks();

    await expect(getHospitalReportingPage(actor, {
      hospitalId: hospitalAId,
      pageSize: 1,
      cursor: "not-a-signed-cursor",
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not release an assembled projection when authority is revoked before final validation", async () => {
    const database = createDatabase({ programs: [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE })] });
    const events: string[] = [];
    database.patientProgram.findMany.mockImplementation(async () => {
      events.push("projection-collected");
      return [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE })];
    });
    mockedResolveAccess
      .mockImplementationOnce(async () => {
        events.push("initial-authorization");
        return access;
      })
      .mockImplementationOnce(async () => {
        events.push("final-authorization");
        throw new NotFoundError();
      });

    await expect(getHospitalReportingPage(actor, { hospitalId: hospitalAId }, { database }))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(events).toEqual(["initial-authorization", "projection-collected", "final-authorization"]);
  });

  it("fails safely when signing is required but the server secret is unavailable", async () => {
    vi.stubEnv("DEMI_HOSPITAL_REPORTING_CURSOR_SECRET", "");
    const database = createDatabase({
      programs: [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE }), programRecord({ id: programA2Id, status: PatientProgramStatus.ACTIVE })],
    });

    await expect(getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 1 }, { database }))
      .rejects.toMatchObject({
        code: "INFRASTRUCTURE",
        message: "Hospital reporting cursor signing is not configured",
      });
  });

  it("turns database failures into a safe infrastructure error", async () => {
    const database = createDatabase();
    database.patientProgram.findMany.mockRejectedValue(new Error("sensitive SQL detail"));

    await expect(getHospitalReportingPage(actor, { hospitalId: hospitalAId }, { database }))
      .rejects.toBeInstanceOf(InfrastructureError);
  });

  it("projects recorded zero separately from missing values", () => {
    expect(hospitalReportQueryInternals.toFact(0)).toEqual({ state: "RECORDED", value: 0 });
    expect(hospitalReportQueryInternals.toFact(null)).toEqual({ state: "NOT_RECORDED" });
  });

  it.each([
    [{ programs: 1_001, followups: 0, goalPlans: 0, activityProgress: 0, goalItems: 0 }, "โปรแกรม"],
    [{ programs: 1, followups: 10_001, goalPlans: 0, activityProgress: 0, goalItems: 0 }, "บันทึกติดตาม"],
    [{ programs: 1, followups: 0, goalPlans: 0, activityProgress: 50_001, goalItems: 0 }, "ความคืบหน้ากิจกรรม"],
  ])("fails export safely when bounded source counts are exceeded", (counts, message) => {
    expect(() => hospitalReportQueryInternals.assertExportBounds(counts)).toThrow(HospitalReportExportLimitError);
    expect(() => hospitalReportQueryInternals.assertExportBounds(counts)).toThrow(message);
  });
});
