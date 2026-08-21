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
import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const mockedAudit = vi.hoisted(() => vi.fn());
const mockedProgramAccess = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

vi.mock("./patient-program-access-service", () => ({
  resolvePatientProgramByIdAccessContext: mockedProgramAccess,
}));

import {
  associatePatientProgramServiceOneArtifact,
  type PatientProgramServiceOneDatabase,
} from "./patient-program-service-one-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const actorUserId = "44444444-4444-4444-8444-444444444444";
const personId = "55555555-5555-4555-8555-555555555555";
const artifactId = "66666666-6666-4666-8666-666666666666";
const associationId = "77777777-7777-4777-8777-777777777777";
const routineId = "88888888-8888-4888-8888-888888888888";
const floatingChartId = "99999999-9999-4999-8999-999999999999";
const dreamCardId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const associatedAt = new Date("2026-08-21T05:00:00.000Z");

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

function createDatabase(input: {
  artifact?: Record<string, unknown> | null;
  artifactAssociation?: Record<string, unknown> | null;
  activityAssociation?: Record<string, unknown> | null;
  program?: Record<string, unknown>;
} = {}): {
  database: PatientProgramServiceOneDatabase;
  transaction: {
    patientProgram: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
    patientEvidenceArtifact: { findFirst: ReturnType<typeof vi.fn> };
    patientProgramServiceOneRoutine: { findUnique: ReturnType<typeof vi.fn> };
    patientProgramServiceOneFloatingChart: { findUnique: ReturnType<typeof vi.fn> };
    patientProgramServiceOneDreamCard: { findUnique: ReturnType<typeof vi.fn> };
    patientProgramServiceOneArtifactAssociation: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
} {
  const transaction = {
    patientProgram: {
      findFirst: vi.fn().mockResolvedValue(
        input.program ?? {
          id: programId,
          patientHospitalRelationshipId: relationshipId,
          status: PatientProgramStatus.ACTIVE,
          startedAt: associatedAt,
          completedAt: null,
        },
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    patientEvidenceArtifact: {
      findFirst: vi.fn().mockResolvedValue(input.artifact === undefined ? { id: artifactId } : input.artifact),
    },
    patientProgramServiceOneRoutine: {
      findUnique: vi.fn().mockResolvedValue({ id: routineId }),
    },
    patientProgramServiceOneFloatingChart: {
      findUnique: vi.fn().mockResolvedValue({ id: floatingChartId }),
    },
    patientProgramServiceOneDreamCard: {
      findUnique: vi.fn().mockResolvedValue({ id: dreamCardId }),
    },
    patientProgramServiceOneArtifactAssociation: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(input.artifactAssociation ?? null)
        .mockResolvedValueOnce(input.activityAssociation ?? null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: associationId,
        patientProgramId: data.patientProgramId,
        patientHospitalRelationshipId: data.patientHospitalRelationshipId,
        patientEvidenceArtifactId: data.patientEvidenceArtifactId,
        routineId: data.routineId,
        floatingChartId: data.floatingChartId,
        dreamCardId: data.dreamCardId,
        createdAt: data.createdAt,
      })),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient)),
  } as unknown as PatientProgramServiceOneDatabase;

  return { database, transaction };
}

describe("Patient Program Service 1 evidence association", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
    mockedProgramAccess.mockResolvedValue(access);
  });

  it.each([
    ["ROUTINE", routineId],
    ["FLOATING_CHART", floatingChartId],
    ["DREAM_CARD", dreamCardId],
  ] as const)("associates a valid %s artifact with its recorded activity", async (activity, activityId) => {
    const { database, transaction } = createDatabase();

    const result = await associatePatientProgramServiceOneArtifact(
      actor,
      {
        patientProgramId: programId,
        patientEvidenceArtifactId: artifactId,
        activity,
      },
      { database, now: () => associatedAt },
    );

    expect(result).toMatchObject({
      activity,
      operation: "ASSOCIATED",
      associationId,
      artifactId,
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      associatedAt,
    });
    expect(transaction.patientProgramServiceOneArtifactAssociation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientProgramId: programId,
        patientHospitalRelationshipId: relationshipId,
        patientEvidenceArtifactId: artifactId,
        routineId: activity === "ROUTINE" ? activityId : null,
        floatingChartId: activity === "FLOATING_CHART" ? activityId : null,
        dreamCardId: activity === "DREAM_CARD" ? activityId : null,
      }),
      select: expect.anything(),
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "patient_program.service_one.artifact_attached",
        metadata: {
          patientProgramId: programId,
          patientHospitalRelationshipId: relationshipId,
          hospitalId,
          activity,
          artifactId,
        },
      }),
      expect.anything(),
    );
  });

  it("is deterministic for an identical repeated association", async () => {
    const existing = {
      id: associationId,
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      patientEvidenceArtifactId: artifactId,
      routineId,
      floatingChartId: null,
      dreamCardId: null,
      createdAt: associatedAt,
    };
    const { database, transaction } = createDatabase({ artifactAssociation: existing });

    await expect(
      associatePatientProgramServiceOneArtifact(
        actor,
        { patientProgramId: programId, patientEvidenceArtifactId: artifactId, activity: "ROUTINE" },
        { database },
      ),
    ).resolves.toMatchObject({ operation: "ALREADY_ASSOCIATED", associationId });
    expect(transaction.patientProgramServiceOneArtifactAssociation.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("rejects a second artifact for the same activity without replacement", async () => {
    const { database, transaction } = createDatabase({
      activityAssociation: {
        id: associationId,
        patientProgramId: programId,
        patientHospitalRelationshipId: relationshipId,
        patientEvidenceArtifactId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        routineId,
        floatingChartId: null,
        dreamCardId: null,
        createdAt: associatedAt,
      },
    });

    await expect(
      associatePatientProgramServiceOneArtifact(
        actor,
        { patientProgramId: programId, patientEvidenceArtifactId: artifactId, activity: "ROUTINE" },
        { database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientProgramServiceOneArtifactAssociation.create).not.toHaveBeenCalled();
  });

  it("rejects an artifact already associated with another Program in the same relationship", async () => {
    const { database, transaction } = createDatabase({
      artifactAssociation: {
        id: associationId,
        patientProgramId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        patientHospitalRelationshipId: relationshipId,
        patientEvidenceArtifactId: artifactId,
        routineId,
        floatingChartId: null,
        dreamCardId: null,
        createdAt: associatedAt,
      },
    });

    await expect(
      associatePatientProgramServiceOneArtifact(
        actor,
        { patientProgramId: programId, patientEvidenceArtifactId: artifactId, activity: "ROUTINE" },
        { database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientProgramServiceOneArtifactAssociation.create).not.toHaveBeenCalled();
  });

  it("rejects an artifact outside the Program relationship scope", async () => {
    const { database, transaction } = createDatabase({ artifact: null });

    await expect(
      associatePatientProgramServiceOneArtifact(
        actor,
        { patientProgramId: programId, patientEvidenceArtifactId: artifactId, activity: "ROUTINE" },
        { database },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(transaction.patientProgramServiceOneArtifactAssociation.create).not.toHaveBeenCalled();
  });

  it("rejects new association after Program completion", async () => {
    const { database, transaction } = createDatabase({
      program: {
        id: programId,
        patientHospitalRelationshipId: relationshipId,
        status: PatientProgramStatus.COMPLETED,
        startedAt: associatedAt,
        completedAt: new Date("2026-08-22T05:00:00.000Z"),
      },
    });

    await expect(
      associatePatientProgramServiceOneArtifact(
        actor,
        { patientProgramId: programId, patientEvidenceArtifactId: artifactId, activity: "ROUTINE" },
        { database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientEvidenceArtifact.findFirst).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied ownership fields through the strict schema", async () => {
    const { database, transaction } = createDatabase();

    await expect(
      associatePatientProgramServiceOneArtifact(
        actor,
        {
          patientProgramId: programId,
          patientEvidenceArtifactId: artifactId,
          activity: "ROUTINE",
          patientHospitalRelationshipId: relationshipId,
        },
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transaction.patientProgram.findFirst).not.toHaveBeenCalled();
  });
});
