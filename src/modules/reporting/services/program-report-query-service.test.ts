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

const mockedReportAccess = vi.hoisted(() => vi.fn());

vi.mock("./program-report-access-service", () => ({
  resolveProgramReportAccessContext: mockedReportAccess,
}));

import {
  PROGRAM_REPORT_DEFAULT_PAGE_SIZE,
  getProgramReportingProjection,
  type ProgramReportQueryDatabase,
} from "./program-report-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const baselineId = "44444444-4444-4444-8444-444444444444";
const finalAssessmentId = "55555555-5555-4555-8555-555555555555";
const recorderId = "66666666-6666-4666-8666-666666666666";
const startedAt = new Date("2026-08-17T05:00:00.000Z");
const completedAt = new Date("2026-08-25T05:00:00.000Z");
const recordedAt = new Date("2026-08-20T05:00:00.000Z");

const actor: ActorContext = {
  userId: recorderId,
  personId: "77777777-7777-4777-8777-777777777777",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId,
      membershipType: MembershipType.OWNER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
};

const access = {
  actor,
  patientProgramId: programId,
  patient: {
    patientHospitalRelationshipId: relationshipId,
    displayName: "สมชาย ผู้ป่วย",
    hospitalNumber: "HN-PRIVATE-001",
    hospital: { id: hospitalId, name: "โรงพยาบาล รายงาน" },
  },
  target: {
    hospitalId,
    hospitalStatus: HospitalStatus.ACTIVE,
    assignedOsmUserId: null,
  },
};

function person(givenName: string, familyName: string) {
  return { givenName, familyName };
}

function coreRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: programId,
    patientHospitalRelationshipId: relationshipId,
    initialBaselineId: baselineId,
    status: PatientProgramStatus.COMPLETED,
    startedAt,
    completedAt,
    createdAt: startedAt,
    createdByUser: { id: recorderId, person: person("ผู้สร้าง", "รายงาน") },
    serviceOneRoutine: {
      recordedAt,
      recordedByUser: { person: person("ผู้บันทึก", "Service") },
      serviceOneArtifactAssociation: {
        createdAt: new Date("2026-08-20T06:00:00.000Z"),
        patientEvidenceArtifact: {
          id: "88888888-8888-4888-8888-888888888888",
          mediaType: "image/jpeg",
          byteSize: 2048,
          createdAt: new Date("2026-08-20T05:30:00.000Z"),
        },
      },
    },
    serviceOneFloatingChart: null,
    serviceOneDreamCard: null,
    serviceOneConfidence: null,
    ...overrides,
  };
}

function baselineRecord(): Record<string, unknown> {
  return {
    id: baselineId,
    patientHospitalRelationshipId: relationshipId,
    recordedOn: new Date("2026-08-16T00:00:00.000Z"),
    createdAt: new Date("2026-08-16T05:00:00.000Z"),
    recordedBy: { id: recorderId, person: person("ผู้บันทึก", "Baseline") },
    weight: 70,
    waistCircumference: null,
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: null,
    bloodSugarDtx: 95,
  };
}

function finalRecord(): Record<string, unknown> {
  return {
    id: finalAssessmentId,
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
    recordedAt: new Date("2026-08-25T05:00:00.000Z"),
    createdAt: new Date("2026-08-25T05:00:00.000Z"),
    recordedBy: { id: recorderId, person: person("ผู้บันทึก", "Final") },
    weight: 80,
    waistCircumference: null,
    systolicBloodPressure: null,
    diastolicBloodPressure: 82,
    bloodSugar: null,
  };
}

function goalRecord(roundNumber: number): Record<string, unknown> {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(roundNumber).padStart(12, "0")}`,
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
    roundNumber,
    createdAt: new Date(`2026-08-${17 + roundNumber}T05:00:00.000Z`),
    createdByUser: { person: person("ผู้บันทึก", "Goal") },
    primaryGoalCode: roundNumber === 1 ? "weight" : "glucose",
    primaryGoalNote: roundNumber === 1 ? "เป้าหมาย" : null,
    weeklyNote: null,
    templateKey: "demi-goals",
    templateVersion: "1",
    items: [
      {
        id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(roundNumber).padStart(12, "0")}`,
        activityCode: "exercise_walk",
        targetDays: 3,
        targetValue: roundNumber === 1 ? 15 : null,
        targetUnit: roundNumber === 1 ? "minutes" : null,
        sortOrder: 1,
      },
    ],
  };
}

function followupRecord(roundNumber: number): Record<string, unknown> {
  return {
    id: `cccccccc-cccc-4ccc-8ccc-${String(roundNumber).padStart(12, "0")}`,
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
    roundNumber,
    recordedAt: new Date(`2026-08-${17 + roundNumber}T06:00:00.000Z`),
    createdAt: new Date(`2026-08-${17 + roundNumber}T06:00:00.000Z`),
    createdByUser: { person: person("ผู้บันทึก", "Follow-up") },
    weight: roundNumber === 2 ? null : 70 + roundNumber,
    waistCircumference: null,
    systolicBloodPressure: 120,
    diastolicBloodPressure: null,
    bloodSugar: 95,
    activityProgress: [
      {
        goalActivityCode: "exercise_walk",
        status:
          roundNumber === 1
            ? FollowupActivityProgressStatus.PARTIAL
            : FollowupActivityProgressStatus.DONE,
        note: roundNumber === 1 ? "ทำได้บางส่วน" : null,
      },
    ],
  };
}

function createDatabase(input: {
  program?: Record<string, unknown>;
  baseline?: Record<string, unknown> | null;
  finalAssessment?: Record<string, unknown> | null;
  goalPlans?: Record<string, unknown>[];
  followups?: Record<string, unknown>[];
} = {}): ProgramReportQueryDatabase & {
  patientProgram: { findFirst: ReturnType<typeof vi.fn> };
  patientBaseline: { findFirst: ReturnType<typeof vi.fn> };
  patientFinalAssessment: { findFirst: ReturnType<typeof vi.fn> };
  patientGoalPlan: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  patientFollowup: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
} {
  return {
    patientProgram: { findFirst: vi.fn().mockResolvedValue(input.program ?? coreRecord()) },
    patientBaseline: {
      findFirst: vi
        .fn()
        .mockResolvedValue(input.baseline === undefined ? baselineRecord() : input.baseline),
    },
    patientFinalAssessment: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          input.finalAssessment === undefined ? finalRecord() : input.finalAssessment,
        ),
    },
    patientGoalPlan: {
      findMany: vi.fn().mockResolvedValue(input.goalPlans ?? [goalRecord(1), goalRecord(2), goalRecord(3)]),
      count: vi.fn().mockResolvedValue(input.goalPlans?.length ?? 3),
    },
    patientFollowup: {
      findMany: vi.fn().mockResolvedValue(input.followups ?? [followupRecord(1), followupRecord(2), followupRecord(3)]),
      count: vi.fn().mockResolvedValue(input.followups?.length ?? 3),
    },
  } as unknown as ProgramReportQueryDatabase & {
    patientProgram: { findFirst: ReturnType<typeof vi.fn> };
    patientBaseline: { findFirst: ReturnType<typeof vi.fn> };
    patientFinalAssessment: { findFirst: ReturnType<typeof vi.fn> };
    patientGoalPlan: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    patientFollowup: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };
}

describe("Program reporting query service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedReportAccess.mockResolvedValue(access);
  });

  it("projects exact source records, explicit missing fields, safe evidence metadata, and bounded pages", async () => {
    const database = createDatabase();
    const projection = await getProgramReportingProjection(
      actor,
      relationshipId,
      programId,
      { goalPlans: { pageSize: 2 }, followups: { pageSize: 2 } },
      { database },
    );

    expect(projection).toMatchObject({
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      hospital: { id: hospitalId, name: "โรงพยาบาล รายงาน" },
      patient: { displayName: "สมชาย ผู้ป่วย" },
      lifecycle: {
        status: PatientProgramStatus.COMPLETED,
        startedAt,
        completedAt,
      },
    });
    expect(projection.linkedBaseline).toMatchObject({
      state: "PRESENT",
      baselineId,
      measurements: {
        weight: { state: "RECORDED", value: 70 },
        waistCircumference: { state: "NOT_RECORDED" },
      },
    });
    expect(projection.serviceOne).toMatchObject({
      routine: {
        state: "PRESENT",
        recorded: true,
        evidence: {
          artifactId: "88888888-8888-4888-8888-888888888888",
          mediaType: "image/jpeg",
          byteSize: 2048,
        },
      },
      floatingChart: { state: "MISSING", recorded: false },
    });
    expect(projection.goalPlans).toMatchObject({
      totalCount: 3,
      pageSize: 2,
      hasMore: true,
    });
    expect(projection.goalPlans.items.map((item) => item.roundNumber)).toEqual([1, 2]);
    expect(projection.goalPlans.items[0]?.items[0]).toMatchObject({
      targetValue: { state: "RECORDED", value: 15 },
      targetUnit: { state: "RECORDED", value: "minutes" },
    });
    expect(projection.followups).toMatchObject({ totalCount: 3, pageSize: 2, hasMore: true });
    expect(projection.followups.items.map((item) => item.roundNumber)).toEqual([1, 2]);
    expect(projection.followups.items[1]?.measurements.weight).toEqual({
      state: "NOT_RECORDED",
    });
    expect(projection.followups.items[0]?.activityProgress).toEqual([
      {
        goalActivityCode: "exercise_walk",
        status: FollowupActivityProgressStatus.PARTIAL,
        note: { state: "RECORDED", value: "ทำได้บางส่วน" },
      },
    ]);
    expect(projection.finalAssessment).toMatchObject({
      state: "PRESENT",
      finalAssessmentId,
      measurements: {
        weight: { state: "RECORDED", value: 80 },
        waistCircumference: { state: "NOT_RECORDED" },
      },
    });

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("HN-PRIVATE-001");
    expect(serialized).not.toContain("hospitalNumber");
    expect(serialized).not.toContain("storageObjectKey");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("BMI");
    expect(serialized).not.toContain("CVD");
    expect(serialized).not.toContain("HbA1c");
    expect(serialized).not.toContain("Height");
    expect(serialized).not.toContain("achievement");
    expect(serialized).not.toContain("success");
    expect(serialized).not.toContain("failure");

    expect(database.patientProgram.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: programId, patientHospitalRelationshipId: relationshipId },
      }),
    );
    expect(database.patientBaseline.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baselineId, patientHospitalRelationshipId: relationshipId },
      }),
    );
    expect(database.patientFinalAssessment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientProgramId: programId, patientHospitalRelationshipId: relationshipId },
      }),
    );
    expect(database.patientGoalPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientProgramId: programId, patientHospitalRelationshipId: relationshipId },
        orderBy: [{ roundNumber: "asc" }, { id: "asc" }],
        take: 3,
      }),
    );
    expect(database.patientFollowup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientProgramId: programId, patientHospitalRelationshipId: relationshipId },
        orderBy: [{ roundNumber: "asc" }, { id: "asc" }],
        take: 3,
      }),
    );
  });

  it("keeps completed Programs with no linked Baseline or Final neutral", async () => {
    const database = createDatabase({
      program: coreRecord({ initialBaselineId: null }),
      baseline: null,
      finalAssessment: null,
      goalPlans: [],
      followups: [],
    });

    const projection = await getProgramReportingProjection(
      actor,
      relationshipId,
      programId,
      undefined,
      { database },
    );

    expect(projection.lifecycle.status).toBe(PatientProgramStatus.COMPLETED);
    expect(projection.linkedBaseline).toEqual({
      state: "MISSING",
      reason: "PROGRAM_HAS_NO_LINKED_BASELINE",
    });
    expect(projection.finalAssessment).toEqual({
      state: "MISSING",
      reason: "PROGRAM_HAS_NO_FINAL",
    });
    expect(projection.followups).toMatchObject({
      items: [],
      totalCount: 0,
      pageSize: PROGRAM_REPORT_DEFAULT_PAGE_SIZE,
      hasMore: false,
      nextCursor: null,
    });
    expect(database.patientBaseline.findFirst).not.toHaveBeenCalled();
  });

  it("fails closed if a child source violates exact Program ownership", async () => {
    const database = createDatabase({
      goalPlans: [{ ...goalRecord(1), patientProgramId: "99999999-9999-4999-8999-999999999999" }],
      followups: [],
    });

    await expect(
      getProgramReportingProjection(actor, relationshipId, programId, undefined, { database }),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });
});
