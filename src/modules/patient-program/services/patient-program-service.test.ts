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
const mockedRelationshipAccess = vi.hoisted(() => vi.fn());
const mockedProgramAccess = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

vi.mock("./patient-program-access-service", () => ({
  resolvePatientProgramAccessContext: mockedRelationshipAccess,
  resolvePatientProgramByIdAccessContext: mockedProgramAccess,
}));

import {
  completePatientProgram,
  openPatientProgram,
  type PatientProgramDatabase,
} from "./patient-program-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const baselineId = "44444444-4444-4444-8444-444444444444";
const actorUserId = "55555555-5555-4555-8555-555555555555";
const personId = "66666666-6666-4666-8666-666666666666";
const startedAt = new Date("2026-08-17T05:00:00.000Z");
const completedAt = new Date("2026-08-18T05:00:00.000Z");

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

function programRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: programId,
    patientHospitalRelationshipId: relationshipId,
    status: PatientProgramStatus.ACTIVE,
    startedAt,
    completedAt: null,
    createdAt: startedAt,
    ...overrides,
  };
}

function createDatabase(input: {
  activeProgram?: Record<string, unknown> | null;
  currentProgram?: Record<string, unknown> | null;
  completedProgram?: Record<string, unknown> | null;
  baseline?: { id: string } | null;
  createResult?: Record<string, unknown>;
  createError?: unknown;
  updateCount?: number;
} = {}): {
  database: PatientProgramDatabase;
  transaction: {
    patientBaseline: { findUnique: ReturnType<typeof vi.fn> };
    patientProgram: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
} {
  const completionRecords = [input.currentProgram ?? null, input.completedProgram ?? null];
  const findFirst = vi.fn().mockImplementation(
    async (args: { where?: { status?: PatientProgramStatus } }) => {
      if (args.where?.status === PatientProgramStatus.ACTIVE) {
        return input.activeProgram ?? null;
      }

      return completionRecords.shift() ?? null;
    },
  );
  const transaction = {
    patientBaseline: {
      findUnique: vi.fn().mockResolvedValue(input.baseline ?? null),
    },
    patientProgram: {
      findFirst,
      create: input.createError
        ? vi.fn().mockRejectedValue(input.createError)
        : vi.fn().mockResolvedValue(input.createResult ?? programRecord()),
      updateMany: vi.fn().mockResolvedValue({ count: input.updateCount ?? 1 }),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as PatientProgramDatabase;

  return { database, transaction };
}

describe("Patient Program service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
    mockedRelationshipAccess.mockResolvedValue(access);
    mockedProgramAccess.mockResolvedValue(access);
  });

  it("opens an episode with a server-owned time and only the Baseline identity", async () => {
    const { database, transaction } = createDatabase({ baseline: { id: baselineId } });

    const result = await openPatientProgram(
      actor,
      { patientHospitalRelationshipId: relationshipId },
      { database, now: () => startedAt },
    );

    expect(result).toMatchObject({
      operation: "OPENED",
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      status: PatientProgramStatus.ACTIVE,
      startedAt,
      completedAt: null,
    });
    expect(transaction.patientProgram.create).toHaveBeenCalledWith({
      data: {
        patientHospitalRelationshipId: relationshipId,
        initialBaselineId: baselineId,
        createdByUserId: actorUserId,
        status: PatientProgramStatus.ACTIVE,
        startedAt,
        createdAt: startedAt,
      },
      select: expect.anything(),
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "patient_program.created",
        resourceType: "PatientProgram",
        resourceId: programId,
        metadata: {
          patientProgramId: programId,
          patientHospitalRelationshipId: relationshipId,
          hospitalId,
          toStatus: PatientProgramStatus.ACTIVE,
        },
      }),
      expect.anything(),
    );
  });

  it("rejects a second active episode before persistence", async () => {
    const { database, transaction } = createDatabase({ activeProgram: { id: programId } });

    await expect(
      openPatientProgram(actor, { patientHospitalRelationshipId: relationshipId }, { database }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientProgram.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("maps the database partial-unique conflict to an application conflict", async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.19.3",
    });
    const { database, transaction } = createDatabase({ createError: duplicateError });

    await expect(
      openPatientProgram(
        actor,
        { patientHospitalRelationshipId: relationshipId },
        { database, transactionRetries: 0 },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientProgram.create).toHaveBeenCalledOnce();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("completes an ACTIVE episode once and audits the transition", async () => {
    const current = programRecord();
    const completed = programRecord({ status: PatientProgramStatus.COMPLETED, completedAt });
    const { database, transaction } = createDatabase({
      activeProgram: current,
      currentProgram: current,
      completedProgram: completed,
    });

    const result = await completePatientProgram(
      actor,
      { patientProgramId: programId },
      { database, now: () => completedAt },
    );

    expect(result).toMatchObject({
      operation: "COMPLETED",
      patientProgramId: programId,
      status: PatientProgramStatus.COMPLETED,
      completedAt,
    });
    expect(transaction.patientProgram.updateMany).toHaveBeenCalledWith({
      where: {
        id: programId,
        patientHospitalRelationshipId: relationshipId,
        status: PatientProgramStatus.ACTIVE,
        completedAt: null,
      },
      data: { status: PatientProgramStatus.COMPLETED, completedAt },
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "patient_program.completed" }),
      expect.anything(),
    );
  });

  it("makes a second completion an idempotent read without changing completedAt", async () => {
    const current = programRecord({ status: PatientProgramStatus.COMPLETED, completedAt });
    const { database, transaction } = createDatabase({ currentProgram: current });

    const result = await completePatientProgram(
      actor,
      { patientProgramId: programId },
      { database, now: () => new Date("2026-08-19T05:00:00.000Z") },
    );

    expect(result).toMatchObject({
      operation: "ALREADY_COMPLETED",
      status: PatientProgramStatus.COMPLETED,
      completedAt,
    });
    expect(transaction.patientProgram.updateMany).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it.each([
    [PatientProgramStatus.ACTIVE, completedAt],
    [PatientProgramStatus.COMPLETED, null],
  ] as const)("rejects an invalid %s lifecycle/timestamp combination", async (status, invalidCompletedAt) => {
    const { database, transaction } = createDatabase({
      currentProgram: programRecord({ status, completedAt: invalidCompletedAt }),
    });

    await expect(
      completePatientProgram(actor, { patientProgramId: programId }, { database }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientProgram.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a completion timestamp earlier than the server-observed start", async () => {
    const { database, transaction } = createDatabase({ currentProgram: programRecord() });

    await expect(
      completePatientProgram(
        actor,
        { patientProgramId: programId },
        { database, now: () => new Date("2026-08-16T05:00:00.000Z") },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientProgram.updateMany).not.toHaveBeenCalled();
  });

  it("keeps authorization failure before any Program write", async () => {
    mockedRelationshipAccess.mockRejectedValueOnce(new ForbiddenError());
    const { database, transaction } = createDatabase();

    await expect(
      openPatientProgram(actor, { patientHospitalRelationshipId: relationshipId }, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transaction.patientProgram.create).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied fields outside the request schema", async () => {
    const { database, transaction } = createDatabase();

    await expect(
      openPatientProgram(
        actor,
        {
          patientHospitalRelationshipId: relationshipId,
          createdByUserId: actorUserId,
        },
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transaction.patientProgram.create).not.toHaveBeenCalled();
  });
});
