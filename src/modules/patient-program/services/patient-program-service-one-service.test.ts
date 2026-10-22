import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/errors/application-error";

const mockedAudit = vi.hoisted(() => vi.fn());
const mockedProgramAccess = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

vi.mock("./patient-program-access-service", () => ({
  resolvePatientProgramByIdAccessContext: mockedProgramAccess,
}));

import {
  recordPatientProgramServiceOneConfidence,
  recordPatientProgramServiceOneFloatingChart,
  recordPatientProgramServiceOneRoutine,
  type PatientProgramServiceOneDatabase,
} from "./patient-program-service-one-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const actorUserId = "44444444-4444-4444-8444-444444444444";
const personId = "55555555-5555-4555-8555-555555555555";
const recordId = "66666666-6666-4666-8666-666666666666";
const recordedAt = new Date("2026-08-20T05:00:00.000Z");
const floatingChartScores = {
  familyScore: -2,
  eatingScore: 1,
  workScore: 0,
  healthScore: 3,
  financeScore: -1,
  travelScore: 2,
  exerciseScore: 5,
  wellbeingScore: -5,
};

const actor: ActorContext = {
  userId: actorUserId,
  personId,
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

const access = {
  actor,
  patient: {
    patientHospitalRelationshipId: relationshipId,
    displayName: "สมชาย ผู้ป่วย",
    hospitalNumber: "HN-001",
    hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
  },
  target: {
    hospitalId,
    hospitalStatus: HospitalStatus.ACTIVE,
    assignedOsmUserId: null,
  },
};

function activeProgram(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: programId,
    patientHospitalRelationshipId: relationshipId,
    status: PatientProgramStatus.ACTIVE,
    startedAt: recordedAt,
    completedAt: null,
    ...overrides,
  };
}

function createDatabase(input: {
  program?: Record<string, unknown>;
  routine?: Record<string, unknown> | null;
  floatingChart?: Record<string, unknown> | null;
  updateCount?: number;
  completedRounds?: number[];
} = {}): {
  database: PatientProgramServiceOneDatabase;
  transaction: {
    patientProgram: {
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    patientProgramServiceOneRoutine: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    patientProgramServiceOneFloatingChart: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    patientProgramServiceOneDreamCard: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    patientProgramServiceOneConfidence: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    patientProgramRoundActivity: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    patientProgramRoundCompletion: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
} {
  const transaction = {
    patientProgram: {
      findFirst: vi.fn().mockResolvedValue(input.program ?? activeProgram()),
      updateMany: vi.fn().mockResolvedValue({ count: input.updateCount ?? 1 }),
    },
    patientProgramServiceOneRoutine: {
      findUnique: vi.fn().mockResolvedValue(input.routine ?? null),
      create: vi.fn().mockResolvedValue({
        id: recordId,
        patientProgramId: programId,
        roundNumber: 1,
        recordedByUserId: actorUserId,
        recordedAt,
      }),
    },
    patientProgramServiceOneFloatingChart: {
      findUnique: vi.fn().mockResolvedValue(input.floatingChart ?? null),
      create: vi.fn().mockResolvedValue({
        id: recordId,
        patientProgramId: programId,
        recordedByUserId: actorUserId,
        recordedAt,
        summary: "สรุป",
        ...floatingChartScores,
      }),
    },
    patientProgramServiceOneDreamCard: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    patientProgramServiceOneConfidence: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    patientProgramRoundActivity: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "77777777-7777-4777-8777-777777777777" }),
    },
    patientProgramRoundCompletion: {
      findMany: vi.fn().mockResolvedValue((input.completedRounds ?? []).map((roundNumber) => ({ roundNumber }))),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as PatientProgramServiceOneDatabase;

  return { database, transaction };
}


/** R2-G: a dated life table with one row. */
function routineInput(roundNumber: number): Record<string, unknown> {
  return {
    patientProgramId: programId,
    roundNumber,
    routineDate: "2026-08-21",
    entries: [{ timeText: "06:00", activity: "ตื่นนอน", adjustment: "เดิน 15 นาที" }],
  };
}

describe("Patient Program Service 1 service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
    mockedProgramAccess.mockResolvedValue(access);
  });

  it("records the life table date and rows with the routine (R2-G)", async () => {
    const { database, transaction } = createDatabase();

    await recordPatientProgramServiceOneRoutine(actor, routineInput(1), { database, now: () => recordedAt });

    expect(transaction.patientProgramServiceOneRoutine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          routineDate: new Date("2026-08-21T00:00:00.000Z"),
          entries: { create: [{ sortOrder: 0, timeText: "06:00", activity: "ตื่นนอน", adjustment: "เดิน 15 นาที" }] },
        }),
      }),
    );
  });

  it("refuses a different life table for an already recorded routine", async () => {
    const { database } = createDatabase({
      routine: {
        id: recordId,
        patientProgramId: programId,
        roundNumber: 1,
        recordedByUserId: actorUserId,
        recordedAt,
        routineDate: new Date("2026-08-21T00:00:00.000Z"),
        entries: [{ timeText: "06:00", activity: "ตื่นนอน", adjustment: "เดิน 15 นาที" }],
      },
    });

    await expect(recordPatientProgramServiceOneRoutine(actor, routineInput(1), { database })).resolves.toMatchObject({
      operation: "ALREADY_RECORDED",
    });
    await expect(
      recordPatientProgramServiceOneRoutine(actor, { ...routineInput(1), entries: [] }, { database }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("records routine once with server provenance and safe audit metadata", async () => {
    const { database, transaction } = createDatabase();

    const result = await recordPatientProgramServiceOneRoutine(
      actor,
      routineInput(1),
      { database, now: () => recordedAt },
    );

    expect(result).toMatchObject({
      activity: "ROUTINE",
      operation: "RECORDED",
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      roundNumber: 1,
      recordedByUserId: actorUserId,
      recordedAt,
    });
    expect(transaction.patientProgramServiceOneRoutine.create).toHaveBeenCalledWith({
      data: {
        patientProgramId: programId,
        roundNumber: 1,
        recordedByUserId: actorUserId,
        recordedAt,
        routineDate: new Date("2026-08-21T00:00:00.000Z"),
        entries: { create: [{ sortOrder: 0, timeText: "06:00", activity: "ตื่นนอน", adjustment: "เดิน 15 นาที" }] },
      },
      select: expect.anything(),
    });
    // SR-D8: the new per-round record is linked to its round in the same transaction.
    expect(transaction.patientProgramRoundActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientProgramId: programId,
        patientHospitalRelationshipId: relationshipId,
        roundNumber: 1,
        toolCode: "ROUTINE",
        // D2: ROUTINE is the whiteboard's round 1 "ตารางชีวิตของฉัน".
        source: "PLANNED",
        mode: "RECORDED",
        linkedRecordType: "SERVICE_ONE_ROUTINE",
        linkedRecordId: recordId,
        recordedByUserId: actorUserId,
        performedAt: recordedAt,
      }),
      select: expect.anything(),
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "patient_program.service_one.routine_recorded",
        resourceType: "PatientProgramServiceOneRoutine",
        metadata: {
          patientProgramId: programId,
          patientHospitalRelationshipId: relationshipId,
          hospitalId,
          activity: "ROUTINE",
          roundNumber: 1,
        },
      }),
      expect.anything(),
    );
  });

  it("returns an idempotent result for an identical floating-chart retry", async () => {
    const existing = {
      id: recordId,
      patientProgramId: programId,
      roundNumber: 1,
      recordedByUserId: actorUserId,
      recordedAt,
      summary: "สรุป",
      ...floatingChartScores,
    };
    const { database, transaction } = createDatabase({ floatingChart: existing });

    const result = await recordPatientProgramServiceOneFloatingChart(
      actor,
      { patientProgramId: programId, roundNumber: 1, ...floatingChartScores, summary: "  สรุป  " },
      { database, now: () => new Date("2026-08-21T05:00:00.000Z") },
    );

    expect(result.operation).toBe("ALREADY_RECORDED");
    expect(result.recordedAt).toBe(recordedAt);
    expect(transaction.patientProgramServiceOneFloatingChart.create).not.toHaveBeenCalled();
    expect(transaction.patientProgramRoundActivity.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("rejects a conflicting second floating-chart submission without overwriting", async () => {
    const existing = {
      id: recordId,
      patientProgramId: programId,
      recordedByUserId: actorUserId,
      recordedAt,
      summary: "ข้อมูลเดิม",
      ...floatingChartScores,
    };
    const { database, transaction } = createDatabase({ floatingChart: existing });

    await expect(
      recordPatientProgramServiceOneFloatingChart(
        actor,
        { patientProgramId: programId, roundNumber: 1, ...floatingChartScores, summary: "ข้อมูลใหม่" },
        { database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientProgramServiceOneFloatingChart.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("rejects a repeated floating-chart submission when any score differs", async () => {
    const existing = {
      id: recordId,
      patientProgramId: programId,
      roundNumber: 1,
      recordedByUserId: actorUserId,
      recordedAt,
      summary: null,
      ...floatingChartScores,
    };
    const { database, transaction } = createDatabase({ floatingChart: existing });

    await expect(
      recordPatientProgramServiceOneFloatingChart(
        actor,
        { patientProgramId: programId, roundNumber: 1, ...floatingChartScores, wellbeingScore: 4 },
        { database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientProgramServiceOneFloatingChart.create).not.toHaveBeenCalled();
  });

  it("rejects Service 1 writes after Program completion and on a completion race", async () => {
    const completedDatabase = createDatabase({
      program: activeProgram({
        status: PatientProgramStatus.COMPLETED,
        completedAt: new Date("2026-08-21T05:00:00.000Z"),
      }),
    });

    await expect(
      recordPatientProgramServiceOneRoutine(
        actor,
        routineInput(1),
        { database: completedDatabase.database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(completedDatabase.transaction.patientProgram.updateMany).not.toHaveBeenCalled();

    const raceDatabase = createDatabase({ updateCount: 0 });
    await expect(
      recordPatientProgramServiceOneRoutine(
        actor,
        routineInput(1),
        { database: raceDatabase.database, transactionRetries: 0 },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(raceDatabase.transaction.patientProgramServiceOneRoutine.create).not.toHaveBeenCalled();
  });

  it("keeps authorization failure before the Service 1 write", async () => {
    mockedProgramAccess.mockRejectedValueOnce(new ForbiddenError());
    const { database, transaction } = createDatabase();

    await expect(
      recordPatientProgramServiceOneConfidence(
        actor,
        { patientProgramId: programId, roundNumber: 1, score: 5 },
        { database },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transaction.patientProgram.findFirst).not.toHaveBeenCalled();
    expect(transaction.patientProgramServiceOneConfidence.create).not.toHaveBeenCalled();
  });

  it("refuses a round 2 result until round 1 is completed, and any write to a completed round (SR-D5)", async () => {
    const locked = createDatabase();
    await expect(
      recordPatientProgramServiceOneConfidence(actor, { patientProgramId: programId, roundNumber: 2, score: 5 }, { database: locked.database }),
    ).rejects.toMatchObject({ name: "RoundConflictError", message: "ต้องจบบริการครั้งที่ 1 ก่อน จึงจะบันทึกครั้งที่ 2 ได้" });
    expect(locked.transaction.patientProgramServiceOneConfidence.create).not.toHaveBeenCalled();

    const completed = createDatabase({ completedRounds: [1] });
    await expect(
      recordPatientProgramServiceOneRoutine(actor, routineInput(1), { database: completed.database }),
    ).rejects.toMatchObject({ name: "RoundConflictError" });
    expect(completed.transaction.patientProgramServiceOneRoutine.create).not.toHaveBeenCalled();

    const open = createDatabase({ completedRounds: [1] });
    open.transaction.patientProgramServiceOneConfidence.create.mockResolvedValue({
      id: recordId, patientProgramId: programId, roundNumber: 2, recordedByUserId: actorUserId, recordedAt, score: 5, improvementPlan: null,
    });
    await expect(
      recordPatientProgramServiceOneConfidence(actor, { patientProgramId: programId, roundNumber: 2, score: 5 }, { database: open.database }),
    ).resolves.toMatchObject({ operation: "RECORDED", roundNumber: 2 });
    expect(open.transaction.patientProgramServiceOneConfidence.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientProgramId_roundNumber: { patientProgramId: programId, roundNumber: 2 } } }),
    );
  });

  it("rejects a tool in a round whose checklist does not list it (SR-D8/SR-D11)", async () => {
    const { database, transaction } = createDatabase();

    await expect(
      recordPatientProgramServiceOneRoutine(actor, routineInput(3), { database }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transaction.patientProgramServiceOneRoutine.create).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied actor fields through the strict service schema", async () => {
    const { database, transaction } = createDatabase();

    await expect(
      recordPatientProgramServiceOneConfidence(
        actor,
        {
          patientProgramId: programId,
          roundNumber: 1,
          score: 5,
          recordedByUserId: actorUserId,
        },
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transaction.patientProgram.findFirst).not.toHaveBeenCalled();
  });
});
