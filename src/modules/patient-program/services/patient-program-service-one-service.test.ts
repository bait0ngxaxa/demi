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
  };
  const database = {
    $transaction: vi.fn(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as PatientProgramServiceOneDatabase;

  return { database, transaction };
}

describe("Patient Program Service 1 service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
    mockedProgramAccess.mockResolvedValue(access);
  });

  it("records routine once with server provenance and safe audit metadata", async () => {
    const { database, transaction } = createDatabase();

    const result = await recordPatientProgramServiceOneRoutine(
      actor,
      { patientProgramId: programId },
      { database, now: () => recordedAt },
    );

    expect(result).toMatchObject({
      activity: "ROUTINE",
      operation: "RECORDED",
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      recordedByUserId: actorUserId,
      recordedAt,
    });
    expect(transaction.patientProgramServiceOneRoutine.create).toHaveBeenCalledWith({
      data: {
        patientProgramId: programId,
        recordedByUserId: actorUserId,
        recordedAt,
      },
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
        },
      }),
      expect.anything(),
    );
  });

  it("returns an idempotent result for an identical floating-chart retry", async () => {
    const existing = {
      id: recordId,
      patientProgramId: programId,
      recordedByUserId: actorUserId,
      recordedAt,
      summary: "สรุป",
    };
    const { database, transaction } = createDatabase({ floatingChart: existing });

    const result = await recordPatientProgramServiceOneFloatingChart(
      actor,
      { patientProgramId: programId, summary: "  สรุป  " },
      { database, now: () => new Date("2026-08-21T05:00:00.000Z") },
    );

    expect(result.operation).toBe("ALREADY_RECORDED");
    expect(result.recordedAt).toBe(recordedAt);
    expect(transaction.patientProgramServiceOneFloatingChart.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("rejects a conflicting second floating-chart submission without overwriting", async () => {
    const existing = {
      id: recordId,
      patientProgramId: programId,
      recordedByUserId: actorUserId,
      recordedAt,
      summary: "ข้อมูลเดิม",
    };
    const { database, transaction } = createDatabase({ floatingChart: existing });

    await expect(
      recordPatientProgramServiceOneFloatingChart(
        actor,
        { patientProgramId: programId, summary: "ข้อมูลใหม่" },
        { database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientProgramServiceOneFloatingChart.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
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
        { patientProgramId: programId },
        { database: completedDatabase.database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(completedDatabase.transaction.patientProgram.updateMany).not.toHaveBeenCalled();

    const raceDatabase = createDatabase({ updateCount: 0 });
    await expect(
      recordPatientProgramServiceOneRoutine(
        actor,
        { patientProgramId: programId },
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
        { patientProgramId: programId, score: 5 },
        { database },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transaction.patientProgram.findFirst).not.toHaveBeenCalled();
    expect(transaction.patientProgramServiceOneConfidence.create).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied actor fields through the strict service schema", async () => {
    const { database, transaction } = createDatabase();

    await expect(
      recordPatientProgramServiceOneConfidence(
        actor,
        {
          patientProgramId: programId,
          score: 5,
          recordedByUserId: actorUserId,
        },
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transaction.patientProgram.findFirst).not.toHaveBeenCalled();
  });
});
