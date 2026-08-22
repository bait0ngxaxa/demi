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
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const mockedAudit = vi.hoisted(() => vi.fn());
const mockedProgramAccess = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

vi.mock("@/modules/patient-program/services/patient-program-access-service", () => ({
  resolvePatientProgramByIdAccessContext: mockedProgramAccess,
}));

import {
  createPatientFinalAssessment,
  type PatientFinalAssessmentDatabase,
} from "./patient-final-assessment-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const finalAssessmentId = "44444444-4444-4444-8444-444444444444";
const actorUserId = "55555555-5555-4555-8555-555555555555";
const personId = "66666666-6666-4666-8666-666666666666";
const recordedAt = new Date("2026-08-22T05:00:00.000Z");

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

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
    weight: 72.5,
    waistCircumference: null,
    systolicBloodPressure: null,
    diastolicBloodPressure: null,
    bloodSugar: null,
    ...overrides,
  };
}

function programRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: programId,
    patientHospitalRelationshipId: relationshipId,
    status: PatientProgramStatus.ACTIVE,
    startedAt: new Date("2026-08-20T05:00:00.000Z"),
    completedAt: null,
    ...overrides,
  };
}

function finalAssessmentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: finalAssessmentId,
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
    recordedByUserId: actorUserId,
    recordedAt,
    createdAt: recordedAt,
    ...overrides,
  };
}

function createDatabase(input: {
  program?: Record<string, unknown> | null;
  existing?: Record<string, unknown> | null;
  createResult?: Record<string, unknown>;
  createError?: unknown;
  updateCount?: number;
  transactionErrors?: unknown[];
} = {}): {
  database: PatientFinalAssessmentDatabase;
  transaction: {
    patientProgram: {
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    patientFinalAssessment: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
} {
  const transaction = {
    patientProgram: {
      findFirst: vi.fn().mockResolvedValue(input.program ?? programRecord()),
      updateMany: vi.fn().mockResolvedValue({ count: input.updateCount ?? 1 }),
    },
    patientFinalAssessment: {
      findUnique: vi.fn().mockResolvedValue(input.existing ?? null),
      create: input.createError
        ? vi.fn().mockRejectedValue(input.createError)
        : vi.fn().mockResolvedValue(input.createResult ?? finalAssessmentRecord()),
    },
  };

  let transactionAttempt = 0;
  const database = {
    $transaction: vi.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) => {
      const transactionError = input.transactionErrors?.[transactionAttempt];
      transactionAttempt += 1;

      if (transactionError) {
        throw transactionError;
      }

      return operation(transaction as unknown as Prisma.TransactionClient);
    }),
  } as unknown as PatientFinalAssessmentDatabase;

  return { database, transaction };
}

function knownError(code: "P2002" | "P2003" | "P2034"): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("database conflict", {
    code,
    clientVersion: "6.19.3",
  });
}

describe("Patient Final Assessment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
    mockedProgramAccess.mockResolvedValue(access);
  });

  it("creates an immutable Program-owned record with server-derived provenance and time", async () => {
    const { database, transaction } = createDatabase();

    const result = await createPatientFinalAssessment(
      actor,
      validInput(),
      { database, now: () => recordedAt },
    );

    expect(result).toMatchObject({
      patientFinalAssessmentId: finalAssessmentId,
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      recordedByUserId: actorUserId,
      recordedAt,
      createdAt: recordedAt,
    });
    expect(transaction.patientFinalAssessment.create).toHaveBeenCalledWith({
      data: {
        patientProgramId: programId,
        patientHospitalRelationshipId: relationshipId,
        recordedByUserId: actorUserId,
        weight: 72.5,
        waistCircumference: null,
        systolicBloodPressure: null,
        diastolicBloodPressure: null,
        bloodSugar: null,
        recordedAt,
        createdAt: recordedAt,
      },
      select: expect.anything(),
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "patient_final_assessment.created",
        resourceType: "PatientFinalAssessment",
        resourceId: finalAssessmentId,
        metadata: {
          patientFinalAssessmentId: finalAssessmentId,
          patientProgramId: programId,
          patientHospitalRelationshipId: relationshipId,
          hospitalId,
        },
      }),
      expect.anything(),
    );
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("72.5");
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("weight");
  });

  it("rejects unauthenticated, empty, and browser-provided provenance input before persistence", async () => {
    const { database, transaction } = createDatabase();

    await expect(createPatientFinalAssessment(null, validInput(), { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      createPatientFinalAssessment(actor, validInput({ weight: null }), { database }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createPatientFinalAssessment(
        actor,
        validInput({
          recordedByUserId: actorUserId,
          recordedAt: recordedAt.toISOString(),
        }),
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transaction.patientFinalAssessment.create).not.toHaveBeenCalled();
  });

  it("rejects a relationship that does not belong to the exact Program", async () => {
    const { database, transaction } = createDatabase();

    await expect(
      createPatientFinalAssessment(
        actor,
        validInput({ patientHospitalRelationshipId: "77777777-7777-4777-8777-777777777777" }),
        { database },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(transaction.patientFinalAssessment.create).not.toHaveBeenCalled();
  });

  it("rejects a completed Program and never persists a late Final Assessment", async () => {
    const { database, transaction } = createDatabase({
      program: programRecord({
        status: PatientProgramStatus.COMPLETED,
        completedAt: new Date("2026-08-21T05:00:00.000Z"),
      }),
    });

    await expect(
      createPatientFinalAssessment(actor, validInput(), { database }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientFinalAssessment.findUnique).not.toHaveBeenCalled();
    expect(transaction.patientFinalAssessment.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("rejects the second immutable Final Assessment for a Program", async () => {
    const { database, transaction } = createDatabase({ existing: finalAssessmentRecord() });

    await expect(
      createPatientFinalAssessment(actor, validInput(), { database }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientFinalAssessment.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("retries P2034 before returning a result", async () => {
    const { database } = createDatabase({ transactionErrors: [knownError("P2034")] });

    await expect(
      createPatientFinalAssessment(actor, validInput(), { database, now: () => recordedAt }),
    ).resolves.toMatchObject({ patientFinalAssessmentId: finalAssessmentId });
    expect(database.$transaction).toHaveBeenCalledTimes(2);
  });

  it.each(["P2002", "P2003"] as const)("normalizes %s without leaking Prisma details", async (code) => {
    const { database } = createDatabase({
      createError: knownError(code),
    });

    await expect(
      createPatientFinalAssessment(actor, validInput(), { database, transactionRetries: 0 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      createPatientFinalAssessment(actor, validInput(), { database, transactionRetries: 0 }),
    ).rejects.not.toHaveProperty("code", code);
  });

  it("rolls the cohesive operation back when audit persistence fails", async () => {
    const { database, transaction } = createDatabase();
    mockedAudit.mockRejectedValue(new InfrastructureError("Audit event could not be persisted"));

    await expect(
      createPatientFinalAssessment(actor, validInput(), { database }),
    ).rejects.toBeInstanceOf(InfrastructureError);
    expect(transaction.patientFinalAssessment.create).toHaveBeenCalledOnce();
    expect(mockedAudit).toHaveBeenCalledOnce();
  });
});
