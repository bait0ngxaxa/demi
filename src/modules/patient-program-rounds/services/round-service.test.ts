import { HospitalStatus, MembershipStatus, MembershipType, Prisma, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/errors/application-error";

const mockedAudit = vi.hoisted(() => vi.fn());
const mockedLock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

vi.mock("@/modules/patient-program/services/patient-program-lifecycle-service", () => ({
  lockActivePatientProgram: mockedLock,
}));

import {
  patientProgramRoundServiceInternals,
  recordPatientProgramRoundReview,
  recordPatientProgramRoundVitals,
  type PatientProgramRoundDatabase,
} from "./round-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const actorUserId = "44444444-4444-4444-8444-444444444444";
const personId = "55555555-5555-4555-8555-555555555555";
const recordId = "66666666-6666-4666-8666-666666666666";
const nonce = "77777777-7777-4777-8777-777777777777";
const now = new Date("2026-10-14T05:00:00.000Z");

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

const locked = {
  access: {
    actor,
    patient: { patientHospitalRelationshipId: relationshipId },
    target: { hospitalId },
  },
  program: { id: programId, patientHospitalRelationshipId: relationshipId },
};

function vitalsInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientProgramId: programId,
    roundNumber: 1,
    submissionNonce: nonce,
    serviceDate: "2026-10-14",
    weight: 70,
    heightCm: 160,
    ...overrides,
  };
}

function storedVitals(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: recordId,
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
    roundNumber: 1,
    serviceDate: new Date("2026-10-14T00:00:00.000Z"),
    weight: 70,
    heightCm: 160,
    waistCircumference: null,
    systolicBloodPressure: null,
    diastolicBloodPressure: null,
    bloodSugar: null,
    recordedByUserId: actorUserId,
    ...overrides,
  };
}

function createDatabase(input: {
  vitalsByNonce?: Record<string, unknown> | null;
  vitalsForRound?: Record<string, unknown> | null;
  activityByNonce?: Record<string, unknown> | null;
  reviewTarget?: { id: string } | null;
  existingLedger?: Record<string, unknown> | null;
} = {}) {
  const transaction = {
    patientProgramRoundVitals: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(input.vitalsByNonce ?? null)
        .mockResolvedValueOnce(input.vitalsForRound ?? null),
      create: vi.fn().mockResolvedValue(storedVitals()),
    },
    patientProgramRoundActivity: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(input.activityByNonce ?? null)
        .mockResolvedValueOnce(input.existingLedger ?? null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: recordId, ...data }),
      ),
    },
    patientProgramServiceOneDreamCard: {
      findUnique: vi.fn().mockResolvedValue(input.reviewTarget === undefined ? { id: recordId } : input.reviewTarget),
    },
    screeningAssessment: {
      findUnique: vi.fn().mockResolvedValue(input.reviewTarget === undefined ? { id: recordId } : input.reviewTarget),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as PatientProgramRoundDatabase;

  return { database, transaction };
}

describe("Program round vitals service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
    mockedLock.mockResolvedValue(locked);
  });

  it("records vitals with server-derived provenance and a safe audit event", async () => {
    const { database, transaction } = createDatabase();

    const result = await recordPatientProgramRoundVitals(actor, vitalsInput(), { database, now: () => now });

    expect(result).toMatchObject({
      operation: "RECORDED",
      roundVitalsId: recordId,
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      roundNumber: 1,
    });
    expect(transaction.patientProgramRoundVitals.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientProgramId: programId,
        patientHospitalRelationshipId: relationshipId,
        roundNumber: 1,
        recordedByUserId: actorUserId,
        submissionNonce: nonce,
        weight: 70,
        heightCm: 160,
        waistCircumference: null,
        recordedAt: now,
      }),
      select: expect.anything(),
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "patient_program_round.vitals_recorded",
        resourceType: "PatientProgramRoundVitals",
        metadata: { patientProgramId: programId, patientHospitalRelationshipId: relationshipId, hospitalId, roundNumber: 1 },
      }),
      expect.anything(),
    );
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("70");
  });

  it("returns the stored record for an identical retry and rejects a reused token with other values", async () => {
    const same = createDatabase({ vitalsByNonce: storedVitals() });
    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput(), { database: same.database, now: () => now }),
    ).resolves.toMatchObject({ operation: "ALREADY_RECORDED", roundVitalsId: recordId });
    expect(same.transaction.patientProgramRoundVitals.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();

    const changed = createDatabase({ vitalsByNonce: storedVitals() });
    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ weight: 99 }), { database: changed.database, now: () => now }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a second vitals record for the same round without overwriting", async () => {
    const { database, transaction } = createDatabase({ vitalsForRound: { id: recordId } });

    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ submissionNonce: randomNonce() }), {
        database,
        now: () => now,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientProgramRoundVitals.create).not.toHaveBeenCalled();
  });

  it("validates before locking: future service date, missing measurement, rounds 3-6, missing actor", async () => {
    const { database } = createDatabase();

    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ serviceDate: "2026-10-16" }), { database, now: () => now }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ weight: null, heightCm: null }), { database, now: () => now }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ roundNumber: 3 }), { database, now: () => now }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      recordPatientProgramRoundVitals(null, vitalsInput(), { database, now: () => now }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockedLock).not.toHaveBeenCalled();
  });

  it("fails closed when the Program lock denies the actor", async () => {
    mockedLock.mockRejectedValue(new ForbiddenError());
    const { database, transaction } = createDatabase();

    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput(), { database, now: () => now }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transaction.patientProgramRoundVitals.create).not.toHaveBeenCalled();
  });

  it("retries a serializable write conflict and then reports a conflict", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "6.19.3" });
    const database = {
      $transaction: vi.fn().mockRejectedValue(conflict),
    } as unknown as PatientProgramRoundDatabase;

    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput(), { database, now: () => now, transactionRetries: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((database as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction).toHaveBeenCalledTimes(2);
  });
});

function randomNonce(): string {
  return "88888888-8888-4888-8888-888888888888";
}

describe("Program round review service (WB-DF-03)", () => {
  const review = { patientProgramId: programId, roundNumber: 3, toolCode: "DREAM_CARD", submissionNonce: nonce };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
    mockedLock.mockResolvedValue(locked);
  });

  it("records a PLANNED review linked to the existing result without creating a Service 1 record", async () => {
    const { database, transaction } = createDatabase();

    const result = await recordPatientProgramRoundReview(actor, review, { database, now: () => now });

    expect(result).toMatchObject({ operation: "RECORDED", source: "PLANNED", roundNumber: 3, toolCode: "DREAM_CARD" });
    expect(transaction.patientProgramRoundActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientProgramId: programId,
        roundNumber: 3,
        toolCode: "DREAM_CARD",
        source: "PLANNED",
        mode: "REVIEWED",
        linkedRecordType: "SERVICE_ONE_DREAM_CARD",
        linkedRecordId: recordId,
        recordedByUserId: actorUserId,
        performedAt: now,
        submissionNonce: nonce,
      }),
      select: expect.anything(),
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "patient_program_round.activity_reviewed" }),
      expect.anything(),
    );
  });

  it("derives EXTRA from the server-side round list, never from the client", async () => {
    const { database, transaction } = createDatabase();

    const result = await recordPatientProgramRoundReview(
      actor,
      { ...review, roundNumber: 2 },
      { database, now: () => now },
    );

    expect(result.source).toBe("EXTRA");
    expect(transaction.patientProgramRoundActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: "EXTRA", mode: "REVIEWED" }),
      select: expect.anything(),
    });
  });

  it("reviews the program screening for both PAM and PROMs", async () => {
    const { database, transaction } = createDatabase();

    await recordPatientProgramRoundReview(actor, { ...review, toolCode: "PROMS" }, { database, now: () => now });

    expect(transaction.screeningAssessment.findUnique).toHaveBeenCalledWith({
      where: { patientProgramId: programId },
      select: { id: true },
    });
    expect(transaction.patientProgramRoundActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ toolCode: "PROMS", linkedRecordType: "SCREENING_ASSESSMENT" }),
      select: expect.anything(),
    });
  });

  it("is idempotent for a replayed token and for an existing round/tool entry", async () => {
    const replay = createDatabase({
      activityByNonce: {
        id: recordId,
        patientProgramId: programId,
        roundNumber: 3,
        toolCode: "DREAM_CARD",
        source: "PLANNED",
        recordedByUserId: actorUserId,
      },
    });
    await expect(
      recordPatientProgramRoundReview(actor, review, { database: replay.database, now: () => now }),
    ).resolves.toMatchObject({ operation: "ALREADY_RECORDED", roundActivityId: recordId });
    expect(replay.transaction.patientProgramRoundActivity.create).not.toHaveBeenCalled();

    const existing = createDatabase({
      existingLedger: {
        id: recordId,
        patientProgramId: programId,
        roundNumber: 3,
        toolCode: "DREAM_CARD",
        source: "PLANNED",
        mode: "REVIEWED",
        linkedRecordType: "SERVICE_ONE_DREAM_CARD",
        linkedRecordId: recordId,
        performedAt: now,
        recordedByUserId: actorUserId,
        submissionNonce: nonce,
      },
    });
    await expect(
      recordPatientProgramRoundReview(actor, review, { database: existing.database, now: () => now }),
    ).resolves.toMatchObject({ operation: "ALREADY_RECORDED" });
    expect(existing.transaction.patientProgramRoundActivity.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("rejects a reused token that belongs to another round or tool", async () => {
    const { database } = createDatabase({
      activityByNonce: {
        id: recordId,
        patientProgramId: programId,
        roundNumber: 4,
        toolCode: "DREAM_CARD",
        source: "PLANNED",
        recordedByUserId: actorUserId,
      },
    });

    await expect(
      recordPatientProgramRoundReview(actor, review, { database, now: () => now }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to review a result that does not exist or in the round that recorded it", async () => {
    const missing = createDatabase({ reviewTarget: null });
    await expect(
      recordPatientProgramRoundReview(actor, review, { database: missing.database, now: () => now }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(missing.transaction.patientProgramRoundActivity.create).not.toHaveBeenCalled();

    const roundOne = createDatabase();
    await expect(
      recordPatientProgramRoundReview(actor, { ...review, roundNumber: 1 }, { database: roundOne.database, now: () => now }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(roundOne.transaction.patientProgramRoundActivity.create).not.toHaveBeenCalled();
  });

  it("rejects tools that cannot be reviewed and fails closed when the Program lock denies the actor", async () => {
    const { database } = createDatabase();

    await expect(
      recordPatientProgramRoundReview(actor, { ...review, toolCode: "KNOW_SELF" }, { database, now: () => now }),
    ).rejects.toBeInstanceOf(ValidationError);

    mockedLock.mockRejectedValue(new ForbiddenError());
    await expect(
      recordPatientProgramRoundReview(actor, review, { database, now: () => now }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("exposes only reviewable tools to findReviewTarget", async () => {
    const { transaction } = createDatabase();

    await expect(
      patientProgramRoundServiceInternals.findReviewTarget(
        transaction as unknown as Prisma.TransactionClient,
        programId,
        "HEALTHY_PLAN",
      ),
    ).resolves.toBeNull();
  });
});
