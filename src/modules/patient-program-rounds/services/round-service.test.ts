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

import { isStepInGuideline, roundGuideline } from "../domain/round-steps";
import {
  completePatientProgramRound,
  recordPatientProgramRoundProfile,
  recordPatientProgramRoundReview,
  recordPatientProgramRoundVitals,
  skipPatientProgramRoundStep,
  unskipPatientProgramRoundStep,
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
const recorder = { person: { givenName: "สมศรี", familyName: "อสม." } };

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

/** ADR-0022: round 1 and each guideline round after a completed one are opened. */
function openedRoundNumbers(completedRounds: readonly number[]): number[] {
  return [...new Set([1, ...completedRounds.map((round) => round + 1).filter((round) => round <= 6)])];
}

/** The program record the completion and skip guards re-read inside the transaction. */
function programRecord(overrides: Record<string, unknown> = {}, completedRounds: readonly number[] = []): Record<string, unknown> {
  const completions = ((overrides.roundCompletions ?? []) as { roundNumber: number }[]).map((row) => row.roundNumber);

  return {
    id: programId,
    patientHospitalRelationshipId: relationshipId,
    status: "ACTIVE",
    patientHospitalRelationship: { hospitalProfile: null },
    initialBaseline: null,
    rounds: openedRoundNumbers([...completedRounds, ...completions]).map((roundNumber) => ({
      roundNumber,
      planItems: roundGuideline(roundNumber).map((definition, index) => ({
        id: `plan-${roundNumber}-${definition.code}`,
        stepCode: definition.code,
        customTitle: null,
        position: index + 1,
        removedAt: null,
        doneAt: null,
        doneByUser: null,
      })),
    })),
    roundVitals: [],
    roundActivities: [],
    roundCompletions: [],
    roundStepSkips: [],
    screeningAssessments: [],
    serviceOneRoutines: [],
    serviceOneFloatingCharts: [],
    serviceOneDreamCards: [],
    serviceOneConfidences: [],
    goalPlans: [],
    followups: [],
    finalAssessment: null,
    ...overrides,
  };
}

function createDatabase(input: {
  vitalsByNonce?: Record<string, unknown> | null;
  vitalsForRound?: Record<string, unknown> | null;
  activityByNonce?: Record<string, unknown> | null;
  screening?: { id: string } | null;
  followup?: { id: string } | null;
  existingLedger?: Record<string, unknown> | null;
  completedRounds?: number[];
  completionByNonce?: Record<string, unknown> | null;
  completionForRound?: Record<string, unknown> | null;
  skip?: Record<string, unknown> | null;
  removedSkips?: number;
  program?: Record<string, unknown>;
  profile?: Record<string, unknown> | null;
  profileUpdateCount?: number;
  vitalsUpdateCount?: number;
} = {}) {
  const opened = new Set(openedRoundNumbers(input.completedRounds ?? []));
  const transaction = {
    patientProgram: {
      findFirst: vi.fn().mockResolvedValue(programRecord(input.program, input.completedRounds)),
    },
    patientProgramRound: {
      findUnique: vi.fn(({ where }: { where: { patientProgramId_roundNumber: { roundNumber: number } } }) =>
        Promise.resolve(opened.has(where.patientProgramId_roundNumber.roundNumber) ? { id: recordId } : null),
      ),
      create: vi.fn().mockResolvedValue({ id: recordId }),
    },
    patientProgramRoundPlanItem: {
      findFirst: vi.fn(({ where }: { where: { roundNumber: number; stepCode: string } }) =>
        Promise.resolve(
          opened.has(where.roundNumber) && isStepInGuideline(where.roundNumber, where.stepCode) ? { id: recordId } : null,
        ),
      ),
    },
    patientProgramRoundCompletion: {
      findMany: vi.fn().mockResolvedValue((input.completedRounds ?? []).map((roundNumber) => ({ roundNumber }))),
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(input.completionByNonce ?? null)
        .mockResolvedValueOnce(input.completionForRound ?? null),
      create: vi.fn().mockResolvedValue({ id: recordId }),
    },
    patientProgramRoundStepSkip: {
      findUnique: vi.fn().mockResolvedValue(input.skip ?? null),
      create: vi.fn().mockResolvedValue({ id: recordId }),
      deleteMany: vi.fn().mockResolvedValue({ count: input.removedSkips ?? 1 }),
    },
    patientProgramRoundVitals: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(input.vitalsByNonce ?? null)
        .mockResolvedValueOnce(input.vitalsForRound ?? null),
      create: vi.fn().mockResolvedValue(storedVitals()),
      updateMany: vi.fn().mockResolvedValue({ count: input.vitalsUpdateCount ?? 1 }),
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
    patientHospitalProfile: {
      findUnique: vi.fn().mockResolvedValue(input.profile ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: input.profileUpdateCount ?? 1 }),
      create: vi.fn().mockResolvedValue({ id: recordId }),
    },
    screeningAssessment: {
      findFirst: vi.fn().mockResolvedValue(input.screening === undefined ? { id: recordId } : input.screening),
    },
    patientFollowup: {
      findFirst: vi.fn().mockResolvedValue(input.followup ?? null),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as PatientProgramRoundDatabase;

  return { database, transaction };
}

const deps = (database: PatientProgramRoundDatabase) => ({ database, now: () => now, transactionRetries: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  mockedAudit.mockResolvedValue(undefined);
  mockedLock.mockResolvedValue(locked);
});

describe("round vitals and the round 1 profile fields", () => {
  it("records vitals with server-derived provenance and a safe audit event", async () => {
    const { database, transaction } = createDatabase();

    const result = await recordPatientProgramRoundVitals(actor, vitalsInput(), deps(database));

    expect(result).toMatchObject({ operation: "RECORDED", roundVitalsId: recordId, roundNumber: 1 });
    expect(transaction.patientProgramRoundVitals.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientProgramId: programId,
        patientHospitalRelationshipId: relationshipId,
        recordedByUserId: actorUserId,
        submissionNonce: nonce,
      }),
      select: expect.anything(),
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "patient_program_round.vitals_recorded",
        metadata: { patientProgramId: programId, patientHospitalRelationshipId: relationshipId, hospitalId, roundNumber: 1 },
      }),
      expect.anything(),
    );
  });

  it("refuses round 2 vitals until round 1 is completed, and any write to a completed round (SR-D5)", async () => {
    const locked2 = createDatabase();
    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ roundNumber: 2 }), deps(locked2.database)),
    ).rejects.toMatchObject({ name: "RoundConflictError", message: "ต้องจบบริการครั้งที่ 1 ก่อน จึงจะบันทึกครั้งที่ 2 ได้" });
    expect(locked2.transaction.patientProgramRoundVitals.create).not.toHaveBeenCalled();

    const completed = createDatabase({ completedRounds: [1] });
    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput(), deps(completed.database)),
    ).rejects.toMatchObject({ message: "ครั้งที่ 1 จบบริการแล้ว ข้อมูลของครั้งนี้เป็นแบบอ่านอย่างเดียว" });
  });

  it("is idempotent for a replayed token and rejects a reused token with different values", async () => {
    const replay = createDatabase({ vitalsByNonce: storedVitals() });
    await expect(recordPatientProgramRoundVitals(actor, vitalsInput(), deps(replay.database))).resolves.toMatchObject({
      operation: "ALREADY_RECORDED",
    });
    expect(replay.transaction.patientProgramRoundVitals.create).not.toHaveBeenCalled();

    const reused = createDatabase({ vitalsByNonce: storedVitals({ weight: 71 }) });
    await expect(recordPatientProgramRoundVitals(actor, vitalsInput(), deps(reused.database))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("adds only the missing values to the round's existing record while the round is writable", async () => {
    const { database, transaction } = createDatabase({ vitalsForRound: storedVitals() });
    const supplement = vitalsInput({ waistCircumference: 88, systolicBloodPressure: 130, diastolicBloodPressure: 85, bloodSugar: 110 });

    await expect(recordPatientProgramRoundVitals(actor, supplement, deps(database))).resolves.toMatchObject({
      operation: "RECORDED",
      roundVitalsId: recordId,
    });
    expect(transaction.patientProgramRoundVitals.create).not.toHaveBeenCalled();
    expect(transaction.patientProgramRoundVitals.updateMany).toHaveBeenCalledWith({
      where: { id: recordId, waistCircumference: null, bloodSugar: null, systolicBloodPressure: null, diastolicBloodPressure: null },
      data: { waistCircumference: 88, bloodSugar: 110, systolicBloodPressure: 130, diastolicBloodPressure: 85 },
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "patient_program_round.vitals_supplemented",
        metadata: expect.objectContaining({ fields: "waistCircumference,bloodSugar,systolicBloodPressure,diastolicBloodPressure" }),
      }),
      expect.anything(),
    );

    // Values already recorded stay as they are; a retry with the same values is a no-op.
    const changed = createDatabase({ vitalsForRound: storedVitals() });
    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ weight: 71, bloodSugar: 110 }), deps(changed.database)),
    ).rejects.toMatchObject({ name: "RoundConflictError", message: "ค่าที่บันทึกไว้แล้วแก้ไขไม่ได้ เพิ่มได้เฉพาะค่าที่ยังขาด" });
    expect(changed.transaction.patientProgramRoundVitals.updateMany).not.toHaveBeenCalled();

    const retried = createDatabase({ vitalsForRound: storedVitals() });
    await expect(recordPatientProgramRoundVitals(actor, vitalsInput(), deps(retried.database))).resolves.toMatchObject({
      operation: "ALREADY_RECORDED",
    });
    expect(retried.transaction.patientProgramRoundVitals.updateMany).not.toHaveBeenCalled();

    const otherDate = createDatabase({ vitalsForRound: storedVitals() });
    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ serviceDate: "2026-10-13", bloodSugar: 110 }), deps(otherDate.database)),
    ).rejects.toMatchObject({ name: "RoundConflictError" });

    const raced = createDatabase({ vitalsForRound: storedVitals(), vitalsUpdateCount: 0 });
    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ bloodSugar: 110 }), deps(raced.database)),
    ).rejects.toMatchObject({ name: "RoundConflictError" });
  });

  it("refuses a supplement to a completed round", async () => {
    const { database, transaction } = createDatabase({ vitalsForRound: storedVitals(), completedRounds: [1] });

    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ bloodSugar: 110 }), deps(database)),
    ).rejects.toMatchObject({ message: "ครั้งที่ 1 จบบริการแล้ว ข้อมูลของครั้งนี้เป็นแบบอ่านอย่างเดียว" });
    expect(transaction.patientProgramRoundVitals.updateMany).not.toHaveBeenCalled();
  });

  it("writes the preferred name and an empty occupation with the profile version (SR-D12)", async () => {
    const { database, transaction } = createDatabase({ profile: { id: "p", version: 3, occupation: null, preferredName: null } });

    await recordPatientProgramRoundVitals(
      actor,
      vitalsInput({ preferredName: "  ป้าใจ  ", occupation: "ครู", profileVersion: 3 }),
      deps(database),
    );

    expect(transaction.patientHospitalProfile.updateMany).toHaveBeenCalledWith({
      where: { id: "p", version: 3 },
      data: { preferredName: "ป้าใจ", occupation: "ครู", version: { increment: 1 } },
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "patient_program_round.profile_updated", metadata: expect.objectContaining({ fields: "preferredName,occupation" }) }),
      expect.anything(),
    );
  });

  it("refuses a stale profile version and overwriting a recorded occupation", async () => {
    const stale = createDatabase({ profile: { id: "p", version: 4, occupation: null, preferredName: null } });
    await expect(
      recordPatientProgramRoundProfile(actor, { patientProgramId: programId, roundNumber: 1, preferredName: "ป้าใจ", profileVersion: 3 }, deps(stale.database)),
    ).rejects.toMatchObject({ name: "RoundConflictError" });

    const occupied = createDatabase({ profile: { id: "p", version: 3, occupation: "ครู", preferredName: null } });
    await expect(
      recordPatientProgramRoundProfile(
        actor,
        { patientProgramId: programId, roundNumber: 1, preferredName: "ป้าใจ", occupation: "ชาวนา", profileVersion: 3 },
        deps(occupied.database),
      ),
    ).rejects.toMatchObject({ message: "อาชีพของผู้ป่วยบันทึกไว้แล้ว แก้ไขได้ที่ข้อมูลผู้ป่วย" });
    expect(occupied.transaction.patientHospitalProfile.updateMany).not.toHaveBeenCalled();

    // Only round 1 takes profile fields; no other profile field passes the strict schema.
    await expect(
      recordPatientProgramRoundVitals(actor, vitalsInput({ roundNumber: 2, preferredName: "ป้าใจ" }), deps(stale.database)),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      recordPatientProgramRoundProfile(actor, { patientProgramId: programId, roundNumber: 1, preferredName: "ป้าใจ", phoneNumber: "1" }, deps(stale.database)),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("round reviews", () => {
  const review = { patientProgramId: programId, roundNumber: 5, toolCode: "PAM", submissionNonce: nonce };

  it("records an extra PAM review in a later round as EXTRA, linked to the screening", async () => {
    const { database, transaction } = createDatabase({ completedRounds: [1, 2, 3, 4] });

    await expect(recordPatientProgramRoundReview(actor, review, deps(database))).resolves.toMatchObject({
      operation: "RECORDED",
      source: "EXTRA",
    });
    expect(transaction.patientProgramRoundActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roundNumber: 5,
        toolCode: "PAM",
        source: "EXTRA",
        mode: "REVIEWED",
        linkedRecordType: "SCREENING_ASSESSMENT",
        linkedRecordId: recordId,
      }),
      select: expect.anything(),
    });
  });

  it("confirms the round 6 health path review as PLANNED once the round has its vitals (SR-D9)", async () => {
    const missing = createDatabase({ completedRounds: [1, 2, 3, 4, 5] });
    await expect(
      recordPatientProgramRoundReview(actor, { ...review, roundNumber: 6, toolCode: "HEALTH_PATH" }, deps(missing.database)),
    ).rejects.toMatchObject({ name: "RoundConflictError" });

    const { database, transaction } = createDatabase({ completedRounds: [1, 2, 3, 4, 5], followup: { id: recordId } });
    await expect(
      recordPatientProgramRoundReview(actor, { ...review, roundNumber: 6, toolCode: "HEALTH_PATH" }, deps(database)),
    ).resolves.toMatchObject({ source: "PLANNED" });
    expect(transaction.patientProgramRoundActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ toolCode: "HEALTH_PATH", linkedRecordType: null, linkedRecordId: null }),
      select: expect.anything(),
    });
  });

  it("rejects the health path review outside round 6 and reviews of per-round tools", async () => {
    const { database } = createDatabase();

    await expect(
      recordPatientProgramRoundReview(actor, { ...review, roundNumber: 3, toolCode: "HEALTH_PATH" }, deps(database)),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      recordPatientProgramRoundReview(actor, { ...review, toolCode: "CONFIDENCE_RULER" }, deps(database)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a review in a locked round and fails closed when the Program lock denies the actor", async () => {
    const lockedRound = createDatabase({ completedRounds: [1] });
    await expect(recordPatientProgramRoundReview(actor, review, deps(lockedRound.database))).rejects.toMatchObject({
      name: "RoundConflictError",
    });

    mockedLock.mockRejectedValue(new ForbiddenError());
    const { database, transaction } = createDatabase({ completedRounds: [1, 2, 3, 4] });
    await expect(recordPatientProgramRoundReview(actor, review, deps(database))).rejects.toBeInstanceOf(ForbiddenError);
    expect(transaction.patientProgramRoundActivity.create).not.toHaveBeenCalled();
  });
});

describe("step skips (SR-D3)", () => {
  const skip = { patientProgramId: programId, roundNumber: 1, stepCode: "PAM", reasonCode: "OTHER", note: "  ผู้ป่วยเหนื่อย  " };

  it("requires a note for OTHER and a step of the round", async () => {
    const { database, transaction } = createDatabase();

    await expect(skipPatientProgramRoundStep(actor, { ...skip, note: " " }, deps(database))).rejects.toBeInstanceOf(ValidationError);
    await expect(skipPatientProgramRoundStep(actor, { ...skip, note: "x".repeat(501) }, deps(database))).rejects.toBeInstanceOf(ValidationError);
    await expect(skipPatientProgramRoundStep(actor, { ...skip, stepCode: "DREAM_CARD" }, deps(database))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(transaction.patientProgramRoundStepSkip.create).not.toHaveBeenCalled();
  });

  it("stores the reason and audits only the reason code, never the note", async () => {
    const { database, transaction } = createDatabase();

    await expect(skipPatientProgramRoundStep(actor, skip, deps(database))).resolves.toMatchObject({ operation: "RECORDED" });
    expect(transaction.patientProgramRoundStepSkip.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roundNumber: 1, stepCode: "PAM", reasonCode: "OTHER", note: "ผู้ป่วยเหนื่อย", skippedByUserId: actorUserId }),
      select: { id: true },
    });
    const audit = mockedAudit.mock.calls[0]?.[0] as { action: string; metadata: Record<string, unknown> };
    expect(audit.action).toBe("patient_program_round.step_skipped");
    expect(audit.metadata).toMatchObject({ stepCode: "PAM", reasonCode: "OTHER" });
    expect(JSON.stringify(audit)).not.toContain("ผู้ป่วยเหนื่อย");
  });

  it("is idempotent for the same skip and refuses skipping a recorded step", async () => {
    const same = createDatabase({ skip: { reasonCode: "OTHER", note: "ผู้ป่วยเหนื่อย" } });
    await expect(skipPatientProgramRoundStep(actor, skip, deps(same.database))).resolves.toMatchObject({ operation: "ALREADY_RECORDED" });

    const done = createDatabase({
      program: { screeningAssessments: [{ id: recordId, instrument: "COMBINED", submittedAt: now, conductedByUser: recorder }] },
    });
    await expect(skipPatientProgramRoundStep(actor, skip, deps(done.database))).rejects.toMatchObject({
      message: "รายการนี้บันทึกแล้ว จึงไม่ต้องข้าม",
    });
  });

  it("unskips before completion and refuses it after", async () => {
    const open = createDatabase();
    await expect(
      unskipPatientProgramRoundStep(actor, { patientProgramId: programId, roundNumber: 1, stepCode: "PAM" }, deps(open.database)),
    ).resolves.toMatchObject({ operation: "RECORDED" });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "patient_program_round.step_unskipped" }),
      expect.anything(),
    );

    const completed = createDatabase({ completedRounds: [1] });
    await expect(
      unskipPatientProgramRoundStep(actor, { patientProgramId: programId, roundNumber: 1, stepCode: "PAM" }, deps(completed.database)),
    ).rejects.toMatchObject({ name: "RoundConflictError" });
    expect(completed.transaction.patientProgramRoundStepSkip.deleteMany).not.toHaveBeenCalled();
  });
});

describe("round completion (SR-D1/SR-D4)", () => {
  const completion = { patientProgramId: programId, roundNumber: 5, submissionNonce: nonce };
  const allSkipped = ["VITALS", "HEALTH_PLAN_REVIEW", "ROUTINE"].map((stepCode) => ({
    roundNumber: 5, stepCode, reasonCode: "PATIENT_DECLINED", note: null, createdAt: now, skippedByUser: recorder,
  }));
  const before = [1, 2, 3, 4];

  it("refuses completion while a step is neither done nor skipped", async () => {
    const { database, transaction } = createDatabase({
      completedRounds: before,
      program: { roundCompletions: before.map((roundNumber) => ({ roundNumber, completedAt: now, completedByUser: recorder })), roundStepSkips: allSkipped.slice(0, 2) },
    });

    await expect(completePatientProgramRound(actor, completion, deps(database))).rejects.toMatchObject({
      message: "ยังมีรายการที่ยังไม่ได้บันทึกหรือข้าม จึงยังจบบริการครั้งนี้ไม่ได้",
    });
    expect(transaction.patientProgramRoundCompletion.create).not.toHaveBeenCalled();
  });

  it("completes with database time, the actor and an audit of counts only", async () => {
    const { database, transaction } = createDatabase({
      completedRounds: before,
      program: { roundCompletions: before.map((roundNumber) => ({ roundNumber, completedAt: now, completedByUser: recorder })), roundStepSkips: allSkipped },
    });

    await expect(completePatientProgramRound(actor, completion, deps(database))).resolves.toMatchObject({ operation: "RECORDED" });
    const created = transaction.patientProgramRoundCompletion.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(created.data).toEqual({
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      roundNumber: 5,
      completedByUserId: actorUserId,
      submissionNonce: nonce,
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "patient_program_round.completed",
        metadata: expect.objectContaining({ roundNumber: 5, doneSteps: 0, skippedSteps: 3 }),
      }),
      expect.anything(),
    );
    // ADR-0022: round 6 opens in the same transaction with its guideline plan.
    expect(transaction.patientProgramRound.create).toHaveBeenCalledOnce();
    expect(transaction.patientProgramRound.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientProgramId: programId,
        roundNumber: 6,
        origin: "GUIDELINE",
        openedAt: now,
        openedByUserId: actorUserId,
        planItems: {
          create: ["VITALS", "HEALTH_PATH_REVIEW", "HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER"].map((stepCode, index) => ({
            stepCode,
            position: index + 1,
            origin: "GUIDELINE",
            createdAt: now,
          })),
        },
      }),
      select: { id: true },
    });
  });

  it("opens no round after the last guideline round (FR-D3: rounds 7-12 are added, never seeded)", async () => {
    const earlier = [1, 2, 3, 4, 5];
    const roundSixSkips = ["VITALS", "HEALTH_PATH_REVIEW", "HEALTH_PLAN_REVIEW", "CONFIDENCE_RULER"].map((stepCode) => ({
      roundNumber: 6,
      stepCode,
      reasonCode: "PATIENT_DECLINED",
      note: null,
      createdAt: now,
      skippedByUser: recorder,
    }));
    const { database, transaction } = createDatabase({
      completedRounds: earlier,
      program: {
        roundCompletions: earlier.map((roundNumber) => ({ roundNumber, completedAt: now, completedByUser: recorder })),
        roundStepSkips: roundSixSkips,
      },
    });

    await expect(completePatientProgramRound(actor, { ...completion, roundNumber: 6 }, deps(database))).resolves.toMatchObject({
      operation: "RECORDED",
      roundNumber: 6,
    });
    expect(transaction.patientProgramRound.create).not.toHaveBeenCalled();
  });

  it("is idempotent per nonce and per round, and refuses a locked round", async () => {
    const replay = createDatabase({ completionByNonce: { patientProgramId: programId, roundNumber: 5 } });
    await expect(completePatientProgramRound(actor, completion, deps(replay.database))).resolves.toMatchObject({
      operation: "ALREADY_RECORDED",
    });

    const otherRound = createDatabase({ completionByNonce: { patientProgramId: programId, roundNumber: 4 } });
    await expect(completePatientProgramRound(actor, completion, deps(otherRound.database))).rejects.toBeInstanceOf(ConflictError);

    const concurrent = createDatabase({ completionForRound: { id: recordId } });
    await expect(completePatientProgramRound(actor, completion, deps(concurrent.database))).resolves.toMatchObject({
      operation: "ALREADY_RECORDED",
    });
    expect(concurrent.transaction.patientProgramRoundCompletion.create).not.toHaveBeenCalled();

    const lockedRound = createDatabase({ completedRounds: [1, 2] });
    await expect(completePatientProgramRound(actor, completion, deps(lockedRound.database))).rejects.toMatchObject({
      message: "ต้องจบบริการครั้งที่ 4 ก่อน จึงจะบันทึกครั้งที่ 5 ได้",
    });
  });
});
