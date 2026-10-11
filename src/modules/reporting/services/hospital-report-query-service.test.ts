import {
  FollowupActivityProgressStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Role,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError } from "@/shared/errors/application-error";

const mockedResolveAccess = vi.hoisted(() => vi.fn());
vi.mock("./hospital-report-access-service", () => ({
  resolveHospitalReportingAccessContext: mockedResolveAccess,
}));

import {
  HospitalReportExportLimitError,
  getHospitalReportingPage,
  hospitalReportQueryInternals,
  type HospitalReportQueryDatabase,
} from "./hospital-report-query-service";

const hospitalAId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";
const programA1Id = "44444444-4444-4444-8444-444444444444";
const programA2Id = "55555555-5555-4555-8555-555555555555";
const startedAt = new Date("2026-08-17T05:00:00.000Z");

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
    activityProgress: [{ goalActivityCode: "walk", status: FollowupActivityProgressStatus.PARTIAL }],
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
} = {}): HospitalReportQueryDatabase & {
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
  return database as unknown as HospitalReportQueryDatabase & typeof database;
}

describe("Hospital reporting query service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveAccess.mockResolvedValue(access);
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
