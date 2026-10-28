vi.mock("./round-report-query-service", () => ({ loadRoundReports: vi.fn().mockResolvedValue(new Map()) }));
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
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

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
const patientProfileId = "99999999-9999-4999-8999-999999999999";
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
    serviceDate: new Date(`2026-08-${String(16 + roundNumber).padStart(2, "0")}T00:00:00.000Z`),
    planAdjusted: roundNumber % 2 === 0,
    hasObstacle: false,
    weight: null,
    waistCircumference: null,
    systolicBloodPressure: 0,
    diastolicBloodPressure: null,
    bloodSugar: roundNumber,
    sourceGoalPlan: {
      templateKey: "demi-goals",
      templateVersion: "legacy-prototype-v1",
      items: [{ activityCode: "exercise_walk", targetDays: 4 }],
    },
    activityProgress: [
      { goalActivityCode: "exercise_walk", status: FollowupActivityProgressStatus.PARTIAL, achievedDays: 3 },
    ],
  };
}

function programRecord(input: {
  id: string;
  status: PatientProgramStatus;
  followupCount?: number;
  baseline?: Record<string, unknown> | null;
  finalAssessment?: Record<string, unknown> | null;
  roundVitals?: Record<string, unknown>[];
  screeningAssessments?: Record<string, unknown>[];
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
      patientProfileId,
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
      hba1c: null,
      confidenceScore: null,
      cvdRiskScore: null,
    } : input.baseline,
    serviceOneRoutines: [],
    serviceOneFloatingCharts: [],
    serviceOneDreamCards: [],
    serviceOneConfidences: [],
    finalAssessment: input.finalAssessment ?? null,
    roundVitals: input.roundVitals ?? [],
    screeningAssessments: input.screeningAssessments ?? [],
    roundCompletions: [],
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
  exerciseEntries?: Record<string, unknown>[];
} = {}): PrismaClient & {
  patientProgram: { findMany: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
  patientHospitalRelationship: { count: ReturnType<typeof vi.fn> };
  patientGoalPlan: { groupBy: ReturnType<typeof vi.fn> };
  patientFollowup: { groupBy: ReturnType<typeof vi.fn> };
  personalExerciseEntry: { findMany: ReturnType<typeof vi.fn> };
} {
  const database = {
    patientProgramRoundCompletion: { groupBy: vi.fn().mockResolvedValue([]) },
    patientProgram: {
      count: vi.fn().mockResolvedValue(2),
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
    personalExerciseEntry: {
      findMany: vi.fn().mockResolvedValue(input.exerciseEntries ?? []),
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

    expect(result.cohort).toBe("ACTIVE");
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
    // Programs without round vitals, a program screening or a Final Assessment report them as missing.
    expect(result.page.items[0]?.roundVitals).toEqual({ round1: { state: "MISSING" }, round2: { state: "MISSING" } });
    expect(result.page.items[0]?.screening).toEqual({ pam: { state: "MISSING" }, proms: { state: "MISSING" } });
    expect(result.page.items[0]?.bmi).toEqual({ baseline: { state: "NOT_RECORDED" }, after: { state: "NOT_RECORDED" } });
    expect(result.page.items[0]?.followups.items[0]).toMatchObject({
      serviceDate: "2026-08-17",
      planAdjusted: false,
      hasObstacle: false,
      achievement: { achievedDays: 3, targetDays: 4, ratePercent: 75, aboveThreshold: true },
    });
    expect(database.patientProgram.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        patientHospitalRelationship: { is: { hospitalId: hospitalAId, endedAt: null } },
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

  it.each(["ACTIVE", "INCLUDE_ENDED"] as const)("groups sequential round completions in the exact %s cohort", async (cohort) => {
    const database = createDatabase();
    const groupBy = vi.fn().mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({
      roundNumber: index + 1, _count: { _all: 6 - index },
    })));
    Object.assign(database, { patientProgramRoundCompletion: { groupBy } });
    database.patientProgram.groupBy.mockResolvedValue([
      { status: PatientProgramStatus.ACTIVE, _count: { _all: 8 } },
      { status: PatientProgramStatus.COMPLETED, _count: { _all: 2 } },
    ]);
    vi.spyOn(database.patientProgram, "count").mockResolvedValueOnce(10).mockResolvedValueOnce(1);
    const result = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, cohort }, { database });
    expect(result.roundProgress).toEqual({ rounds: [1, 1, 1, 1, 1, 1, 1], afterRecorded: 1, completed: 2 });
    expect(result.roundProgress.rounds.reduce((sum, value) => sum + value, 0)
      + result.roundProgress.afterRecorded + result.roundProgress.completed).toBe(result.counts.programs.total);
    expect(groupBy).toHaveBeenCalledExactlyOnceWith({ by: ["roundNumber"], _count: { _all: true }, where: {
      patientProgram: { is: { AND: [{ patientHospitalRelationship: { is: { hospitalId: hospitalAId,
        ...(cohort === "ACTIVE" ? { endedAt: null } : {}) } }, status: { in: ["ACTIVE", "COMPLETED"] } }, { status: "ACTIVE", finalAssessment: { is: null } }] } },
    } });
  });

  describe("full-cohort dashboard aggregates", () => {
    const serviceOneRelations = {
      serviceOneRoutines: 1,
      serviceOneFloatingCharts: 1,
      serviceOneDreamCards: 3,
      serviceOneConfidences: 1,
    } as const;
    type ServiceOneRelation = keyof typeof serviceOneRelations;

    // Answers each Program count by the record relation its predicate names; other counts fall back.
    function stubProgramCounts(
      database: ReturnType<typeof createDatabase>,
      values: Record<ServiceOneRelation, number>,
      fallback: { filtered: number; afterRecorded: number },
    ): ReturnType<typeof vi.fn> {
      const count = vi.fn(async (args: { where: unknown }) => {
        const serialized = JSON.stringify(args.where);
        const relation = (Object.keys(serviceOneRelations) as ServiceOneRelation[])
          .find((key) => serialized.includes(`"${key}"`));
        if (relation) return values[relation];
        return serialized.includes('"finalAssessment":{"isNot":null}') ? fallback.afterRecorded : fallback.filtered;
      });
      Object.assign(database.patientProgram, { count });
      return count;
    }

    function serviceOneCountWhere(relation: ServiceOneRelation, cohort: "ACTIVE" | "INCLUDE_ENDED"): unknown {
      return { where: { AND: [
        {
          patientHospitalRelationship: { is: { hospitalId: hospitalAId, ...(cohort === "ACTIVE" ? { endedAt: null } : {}) } },
          status: { in: [PatientProgramStatus.ACTIVE, PatientProgramStatus.COMPLETED] },
        },
        { [relation]: { some: { roundNumber: serviceOneRelations[relation] } } },
      ] } };
    }

    it.each(["ACTIVE", "INCLUDE_ENDED"] as const)(
      "counts Programs with each Service 1 record in the exact %s cohort",
      async (cohort) => {
        const database = createDatabase();
        const count = stubProgramCounts(database, {
          serviceOneRoutines: 3, serviceOneFloatingCharts: 2, serviceOneDreamCards: 0, serviceOneConfidences: 1,
        }, { filtered: 2, afterRecorded: 0 });

        const result = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, cohort }, { database });

        expect(result.serviceProcess).toEqual({
          programsWithRoutineRecord: { grain: "PATIENT_PROGRAM", value: 3 },
          programsWithFloatingChartRecord: { grain: "PATIENT_PROGRAM", value: 2 },
          // A true zero comes from the authorized count, not from a missing value.
          programsWithDreamCardRecord: { grain: "PATIENT_PROGRAM", value: 0 },
          programsWithConfidenceRecord: { grain: "PATIENT_PROGRAM", value: 1 },
        });
        for (const relation of Object.keys(serviceOneRelations) as ServiceOneRelation[]) {
          expect(count).toHaveBeenCalledWith(serviceOneCountWhere(relation, cohort));
        }
      },
    );

    it("counts each Program once per record type even when its counts overlap across types", async () => {
      // One Program holding every Service 1 record must appear in every bar, not be split between them.
      const database = createDatabase({
        programs: [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE })],
      });
      database.patientProgram.groupBy.mockResolvedValue([{ status: PatientProgramStatus.ACTIVE, _count: { _all: 1 } }]);
      stubProgramCounts(database, {
        serviceOneRoutines: 1, serviceOneFloatingCharts: 1, serviceOneDreamCards: 1, serviceOneConfidences: 1,
      }, { filtered: 1, afterRecorded: 0 });

      const result = await getHospitalReportingPage(actor, { hospitalId: hospitalAId }, { database });

      const values = Object.values(result.serviceProcess).map(({ value }) => value);
      expect(values).toEqual([1, 1, 1, 1]);
      expect(Math.max(...values)).toBeLessThanOrEqual(result.counts.programs.total);
    });

    it("keeps summary, round progress and Service 1 counts independent of search, filters and pagination", async () => {
      const database = createDatabase({
        programs: [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE })],
      });
      database.patientProgram.groupBy.mockResolvedValue([
        { status: PatientProgramStatus.ACTIVE, _count: { _all: 30 } },
        { status: PatientProgramStatus.COMPLETED, _count: { _all: 12 } },
      ]);
      const count = stubProgramCounts(database, {
        serviceOneRoutines: 25, serviceOneFloatingCharts: 24, serviceOneDreamCards: 9, serviceOneConfidences: 20,
      }, { filtered: 1, afterRecorded: 4 });

      const result = await getHospitalReportingPage(actor, {
        hospitalId: hospitalAId, pageSize: 1, search: "สมชาย", status: "ACTIVE", progress: "0",
      }, { database });

      expect(result.page.total).toBe(1);
      expect(result.page.items).toHaveLength(1);
      expect(result.counts.programs).toEqual({ grain: "PATIENT_PROGRAM", total: 42, active: 30, completed: 12 });
      expect(result.serviceProcess.programsWithRoutineRecord.value).toBe(25);
      expect(result.roundProgress.afterRecorded).toBe(4);
      expect(result.roundProgress.completed).toBe(12);
      // Only the page-total count carries the user's filters; every aggregate uses the bare cohort scope.
      const filteredCalls = count.mock.calls.filter(([args]) => JSON.stringify(args).includes("สมชาย"));
      expect(filteredCalls).toHaveLength(1);
      expect(JSON.stringify(database.patientProgram.groupBy.mock.calls)).not.toContain("สมชาย");
    });

    it.each([
      {
        name: "an empty Hospital",
        active: 0, completed: 0, afterRecorded: 0, atLeast: [],
        rounds: [0, 0, 0, 0, 0, 0, 0],
      },
      {
        name: "ACTIVE Programs spread over 0-6 completed rounds",
        active: 9, completed: 0, afterRecorded: 0, atLeast: [7, 6, 5, 4, 3, 2],
        rounds: [2, 1, 1, 1, 1, 1, 2],
      },
      {
        name: "an ACTIVE Program with After recorded beside COMPLETED Programs",
        // The After-recorded Program completed all six rounds but is excluded from the round groupBy.
        active: 3, completed: 4, afterRecorded: 1, atLeast: [2, 1, 1],
        rounds: [0, 1, 0, 1, 0, 0, 0],
      },
    ])("partitions $name into mutually exclusive buckets that sum to all Programs", async (scenario) => {
      const database = createDatabase();
      Object.assign(database, { patientProgramRoundCompletion: { groupBy: vi.fn().mockResolvedValue(
        scenario.atLeast.map((programs, index) => ({ roundNumber: index + 1, _count: { _all: programs } })),
      ) } });
      database.patientProgram.groupBy.mockResolvedValue([
        { status: PatientProgramStatus.ACTIVE, _count: { _all: scenario.active } },
        { status: PatientProgramStatus.COMPLETED, _count: { _all: scenario.completed } },
      ]);
      stubProgramCounts(database, {
        serviceOneRoutines: 0, serviceOneFloatingCharts: 0, serviceOneDreamCards: 0, serviceOneConfidences: 0,
      }, { filtered: scenario.active + scenario.completed, afterRecorded: scenario.afterRecorded });

      const result = await getHospitalReportingPage(actor, { hospitalId: hospitalAId }, { database });

      expect(result.roundProgress).toEqual({
        rounds: scenario.rounds, afterRecorded: scenario.afterRecorded, completed: scenario.completed,
      });
      expect(result.roundProgress.rounds.every((value) => value >= 0)).toBe(true);
      expect(result.roundProgress.rounds.reduce((sum, value) => sum + value, 0)
        + result.roundProgress.afterRecorded + result.roundProgress.completed).toBe(result.counts.programs.total);
    });

    it("returns the same exact-Hospital Service 1 counts to the Global ADMIN operation", async () => {
      const database = createDatabase();
      const count = stubProgramCounts(database, {
        serviceOneRoutines: 2, serviceOneFloatingCharts: 1, serviceOneDreamCards: 1, serviceOneConfidences: 0,
      }, { filtered: 2, afterRecorded: 0 });

      const result = await getGlobalAdminHospitalReportingPage(globalActor, { hospitalId: hospitalAId }, { database });

      expect(result.serviceProcess.programsWithRoutineRecord.value).toBe(2);
      expect(result.serviceProcess.programsWithConfidenceRecord.value).toBe(0);
      expect(count).toHaveBeenCalledWith(serviceOneCountWhere("serviceOneRoutines", "ACTIVE"));
      expect(mockedResolveAccess).not.toHaveBeenCalled();
    });
  });

  it.each([
    { search: "ต่างคน" }, { progress: "2" }, { status: "COMPLETED" }, { cohort: "INCLUDE_ENDED" },
  ])("rejects a continuation with changed filters %j before reading rows", async (change) => {
    const database = createDatabase({ programs: [
      programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE }),
      programRecord({ id: programA2Id, status: PatientProgramStatus.ACTIVE }),
    ] });
    const page = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 1 }, { database });
    database.patientProgram.findMany.mockClear();
    await expect(getHospitalReportingPage(actor, {
      hospitalId: hospitalAId, pageSize: 1, cursor: page.page.nextCursor, ...change,
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
    expect(database.patientProgram.findMany).not.toHaveBeenCalled();
  });

  it("returns a signed previous page and reverses ascending results into display order", async () => {
    const first = programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE });
    const second = programRecord({ id: programA2Id, status: PatientProgramStatus.ACTIVE });
    const database = createDatabase({ programs: [first, second] });
    const page1 = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 1 }, { database });
    database.patientProgram.findMany.mockResolvedValueOnce([second]);
    const page2 = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 1, cursor: page1.page.nextCursor }, { database });
    expect(page2.page.number).toBe(2);
    expect(page2.page.previousCursor).toBeTruthy();
    database.patientProgram.findMany.mockResolvedValueOnce([first]);
    const back = await getHospitalReportingPage(actor, { hospitalId: hospitalAId, pageSize: 1, cursor: page2.page.previousCursor }, { database });
    expect(back.page.number).toBe(1);
    expect(back.page.previousCursor).toBeNull();
    expect(back.page.items.map((row) => row.patientProgramId)).toEqual(page1.page.items.map((row) => row.patientProgramId));
    expect(database.patientProgram.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      where: expect.objectContaining({ OR: [{ startedAt: { gt: startedAt } }, { startedAt, id: { gt: programA2Id } }] }),
    }));
  });

  it("rejects an unsupported cohort before querying report data", async () => {
    const database = createDatabase();
    const invalidRequest: unknown = { hospitalId: hospitalAId, cohort: "ALL" };

    await expect(getHospitalReportingPage(actor, invalidRequest, { database })).rejects.toBeInstanceOf(NotFoundError);
    expect(mockedResolveAccess).not.toHaveBeenCalled();
    expect(database.patientProgram.findMany).not.toHaveBeenCalled();
  });

  it("does not grant ended-cohort access through the Global ADMIN report path", async () => {
    const database = createDatabase();

    await expect(getGlobalAdminHospitalReportingPage(globalActor, {
      hospitalId: hospitalAId,
      cohort: "INCLUDE_ENDED",
    }, { database })).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockedResolveGlobalAccess).not.toHaveBeenCalled();
    expect(database.patientProgram.findMany).not.toHaveBeenCalled();
  });

  it("projects round 1-2 vitals, BMI (value only), After HbA1c and the Program screening scores", async () => {
    const program = programRecord({
      id: programA1Id,
      status: PatientProgramStatus.COMPLETED,
      baseline: {
        id: "77777777-7777-4777-8777-777777777777",
        recordedOn: new Date("2026-08-16T00:00:00.000Z"),
        weight: 74.5,
        heightCm: 162,
        waistCircumference: null,
        bloodPressureSystolic: null,
        bloodPressureDiastolic: null,
        bloodSugarDtx: null,
        hba1c: 7.2,
        confidenceScore: 6,
        cvdRiskScore: 12.5,
      },
      roundVitals: [
        {
          roundNumber: 1,
          serviceDate: new Date("2026-08-17T00:00:00.000Z"),
          weight: 74,
          heightCm: 162,
          waistCircumference: null,
          systolicBloodPressure: null,
          diastolicBloodPressure: null,
          bloodSugar: 118,
        },
        {
          roundNumber: 2,
          serviceDate: new Date("2026-08-24T00:00:00.000Z"),
          weight: 73,
          heightCm: 163,
          waistCircumference: null,
          systolicBloodPressure: null,
          diastolicBloodPressure: null,
          bloodSugar: 112,
        },
      ],
      screeningAssessments: [
        {
          submittedAt: new Date("2026-08-17T03:00:00.000Z"),
          instrument: "COMBINED",
          scoringVersion: "legacy-prototype-v1",
          result: { pamTotal: 15, promsTotal: 18, promsMin: 2, combinedTotal: 33, percentage: 75, level: "L3", zone: "YELLOW" },
        },
      ],
      finalAssessment: {
        recordedAt: new Date("2026-09-30T03:00:00.000Z"),
        serviceDate: new Date("2026-09-29T00:00:00.000Z"),
        weight: 69,
        waistCircumference: null,
        systolicBloodPressure: null,
        diastolicBloodPressure: null,
        bloodSugar: null,
        hba1c: 6.8,
        cvdRiskScore: 9.8,
      },
    });
    const database = createDatabase({ programs: [program], relationshipCount: 1 });

    const result = await getHospitalReportingPage(actor, { hospitalId: hospitalAId }, { database });
    const row = result.page.items[0];

    expect(row?.roundVitals.round1).toMatchObject({
      state: "PRESENT",
      value: {
        serviceDate: "2026-08-17",
        measurements: { bloodSugar: { state: "RECORDED", value: 118 }, weight: { state: "RECORDED", value: 74 } },
      },
    });
    expect(row?.roundVitals.round2).toMatchObject({
      state: "PRESENT",
      value: { measurements: { bloodSugar: { state: "RECORDED", value: 112 } } },
    });
    // WB-DF-04: Before = Baseline weight / Baseline height; After = Final weight / latest recorded height (round 2).
    expect(row?.bmi.baseline).toEqual({ state: "RECORDED", value: 28.4 });
    expect(row?.latestHeightCm).toEqual({ state: "RECORDED", value: 163 });
    expect(row?.bmi.after).toEqual({ state: "RECORDED", value: 26 });
    expect(row?.finalAssessment).toMatchObject({
      state: "PRESENT",
      value: { hba1c: { state: "RECORDED", value: 6.8 }, cvdRiskScore: { state: "RECORDED", value: 9.8 } },
    });
    // D7/D8: Baseline HbA1c (%), confidence ruler (0-10) and CVD risk (%) are reported as recorded.
    expect(row?.baseline).toMatchObject({
      state: "PRESENT",
      value: {
        hba1c: { state: "RECORDED", value: 7.2 },
        confidenceScore: { state: "RECORDED", value: 6 },
        cvdRiskScore: { state: "RECORDED", value: 12.5 },
      },
    });
    expect(row?.unavailable).toEqual({ achievementRate: "DERIVATION_UNAPPROVED", outcome: "SOURCE_MISSING" });
    // A legacy combined screening answers both columns and keeps its PROMs total.
    expect(row?.screening).toEqual({
      pam: { state: "PRESENT", value: { submittedAt: "2026-08-17T03:00:00.000Z", score: 15 } },
      proms: { state: "PRESENT", value: { submittedAt: "2026-08-17T03:00:00.000Z", legacyTotal: 18 } },
    });
  });

  it("reports booklet PAM as its total and PROMs as a problem flag (R2-C, Q6)", async () => {
    const program = programRecord({
      id: programA1Id,
      status: PatientProgramStatus.ACTIVE,
      screeningAssessments: [
        {
          submittedAt: new Date("2026-08-17T03:00:00.000Z"),
          instrument: "PAM",
          scoringVersion: "pam-booklet-v1",
          result: { total: 12, group: "GENERAL" },
        },
        {
          submittedAt: new Date("2026-08-17T03:10:00.000Z"),
          instrument: "PROMS",
          scoringVersion: "proms-booklet-v1",
          result: { itemScores: { "proms-1": 2 }, hasProblem: true, problemItemKeys: ["proms-1"] },
        },
      ],
    });
    const database = createDatabase({ programs: [program], relationshipCount: 1 });

    const result = await getHospitalReportingPage(actor, { hospitalId: hospitalAId }, { database });

    expect(result.page.items[0]?.screening).toEqual({
      pam: { state: "PRESENT", value: { submittedAt: "2026-08-17T03:00:00.000Z", score: 12 } },
      proms: { state: "PRESENT", value: { submittedAt: "2026-08-17T03:10:00.000Z", hasProblem: true } },
    });
  });

  it("gives every Hospital related to the same Patient the same profile-level aggregate (D9)", async () => {
    const otherRelationshipId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const hospitalA = programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE });
    const hospitalB = {
      ...programRecord({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: PatientProgramStatus.ACTIVE }),
      patientHospitalRelationshipId: otherRelationshipId,
      patientHospitalRelationship: {
        id: otherRelationshipId,
        hospitalNumber: "HOSP-B-01",
        patientProfileId,
        patientProfile: { person: { givenName: "สมชาย", familyName: "ใจดี" } },
        osmAssignments: [],
      },
    };
    const database = createDatabase({
      exerciseEntries: [
        { id: "e1", patientProfileId, occurredOn: new Date("2026-08-10T00:00:00.000Z"), durationMinutes: 80 },
      ],
    });

    const facts = await hospitalReportQueryInternals.loadWeeklyExerciseFacts(
      database,
      [hospitalA, hospitalB] as unknown as Parameters<typeof hospitalReportQueryInternals.loadWeeklyExerciseFacts>[1],
    );

    expect(facts.get(programA1Id)?.before).toEqual({ state: "RECORDED", value: 20 });
    expect(facts.get("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")?.before).toEqual(facts.get(programA1Id)?.before);
  });

  it("averages self-reported exercise minutes per week over the 28 Bangkok days before start and Final (D9)", async () => {
    const entry = (id: string, occurredOn: string, durationMinutes: number | null) => ({
      id,
      patientProfileId,
      occurredOn: new Date(`${occurredOn}T00:00:00.000Z`),
      durationMinutes,
    });
    const program = programRecord({
      id: programA1Id,
      status: PatientProgramStatus.COMPLETED,
      finalAssessment: {
        recordedAt: new Date("2026-09-30T03:00:00.000Z"),
        serviceDate: new Date("2026-09-29T00:00:00.000Z"),
        weight: 69,
        waistCircumference: null,
        systolicBloodPressure: null,
        diastolicBloodPressure: null,
        bloodSugar: null,
        hba1c: null,
        cvdRiskScore: null,
      },
    });
    const database = createDatabase({
      programs: [program],
      relationshipCount: 1,
      exerciseEntries: [
        // Program starts 2026-08-17 (Bangkok): Before window is 2026-07-20 .. 2026-08-16.
        entry("e1", "2026-07-19", 500),
        entry("e2", "2026-07-20", 60),
        entry("e3", "2026-08-16", 90),
        entry("e4", "2026-08-17", 500),
        entry("e5", "2026-08-01", null),
      ],
    });

    const row = (await getHospitalReportingPage(actor, { hospitalId: hospitalAId }, { database })).page.items[0];

    expect(row?.weeklyExercise).toEqual({
      before: { state: "RECORDED", value: 37.5 },
      // Final service date 2026-09-29: After window 2026-09-01 .. 2026-09-28 has no entries.
      after: { state: "NOT_RECORDED" },
    });
    expect(database.personalExerciseEntry.findMany).toHaveBeenCalledWith({
      where: {
        durationMinutes: { not: null },
        OR: [
          { patientProfileId, occurredOn: { gte: new Date("2026-07-20T00:00:00.000Z"), lte: new Date("2026-08-16T00:00:00.000Z") } },
          { patientProfileId, occurredOn: { gte: new Date("2026-09-01T00:00:00.000Z"), lte: new Date("2026-09-28T00:00:00.000Z") } },
        ],
      },
      select: { id: true, patientProfileId: true, occurredOn: true, durationMinutes: true },
    });

    // Without a Final Assessment only the Before window is read and After is not recorded.
    const active = createDatabase({
      programs: [programRecord({ id: programA1Id, status: PatientProgramStatus.ACTIVE })],
      exerciseEntries: [entry("e2", "2026-07-20", 60)],
    });
    const activeRow = (await getHospitalReportingPage(actor, { hospitalId: hospitalAId }, { database: active })).page.items[0];
    expect(activeRow?.weeklyExercise).toEqual({ before: { state: "RECORDED", value: 15 }, after: { state: "NOT_RECORDED" } });
    expect(active.personalExerciseEntry.findMany.mock.calls[0]?.[0].where.OR).toHaveLength(1);
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
        patientHospitalRelationship: { is: { hospitalId: hospitalAId, endedAt: null } },
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
        patientHospitalRelationship: { is: { hospitalId: hospitalAId, endedAt: null } },
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
