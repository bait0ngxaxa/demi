import "server-only";

import {
  Prisma,
  type PatientProgramRoundToolCode,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  lockActivePatientProgram,
  type ActivePatientProgramMutationContext,
} from "@/modules/patient-program/services/patient-program-lifecycle-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";
import { isServiceDateAfter, serviceDateToUtcDate } from "@/shared/time/service-date";

import {
  GUIDELINE_ROUND_COUNT,
  HEALTH_PATH_REVIEW_ROUND,
  isValidRoundNumber,
  SERVICE_ONE_HOME_ROUND,
  SERVICE_ONE_TOOL_LINKED_RECORD_TYPES,
} from "../domain/round-catalog";
import { RoundConflictError } from "../domain/round-conflict-error";
import {
  computeRoundStatus,
  ROUND_ITEM_CATALOG,
  roundPlan,
  VITALS_MEASUREMENTS,
  type RoundStepCode,
  type VitalsMeasurement,
} from "../domain/round-steps";
import {
  roundCompletionRequestSchema,
  roundProfileRequestSchema,
  roundReviewRequestSchema,
  roundStepSkipRequestSchema,
  roundStepUnskipRequestSchema,
  roundVitalsRequestSchema,
  type RoundCompletionRequest,
  type RoundProfileRequest,
  type RoundReviewRequest,
  type RoundStepSkipRequest,
  type RoundStepUnskipRequest,
  type RoundVitalsRequest,
} from "../schemas/round-schemas";
import { ensureRoundLedgerEntry } from "./round-ledger";
import { assertActivePlanItem, classifyRoundActivity, openGuidelineRound } from "./round-plan-service";
import { buildProgramRoundFacts, loadProgramRoundRecord } from "./round-query-service";
import { assertRoundWritable } from "./round-sequencing";

export type PatientProgramRoundDatabase = PrismaClient;

export type PatientProgramRoundServiceDependencies = {
  database?: PatientProgramRoundDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientProgramRoundOperation = "RECORDED" | "ALREADY_RECORDED";

/** Common result of every round write: enough for the caller to revalidate and move on. */
export type PatientProgramRoundWriteResult = {
  operation: PatientProgramRoundOperation;
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  roundNumber: number;
  done?: number;
  skipped?: number;
  notDone?: number;
};

export type PatientProgramRoundVitalsResult = PatientProgramRoundWriteResult & {
  roundVitalsId: string;
};

export type PatientProgramRoundReviewResult = PatientProgramRoundWriteResult & {
  roundActivityId: string;
  toolCode: PatientProgramRoundToolCode;
  source: "PLANNED" | "EXTRA";
};

const DEFAULT_TRANSACTION_RETRIES = 2;

const roundVitalsSelect = {
  id: true,
  patientProgramId: true,
  patientHospitalRelationshipId: true,
  roundNumber: true,
  serviceDate: true,
  weight: true,
  heightCm: true,
  waistCircumference: true,
  systolicBloodPressure: true,
  diastolicBloodPressure: true,
  bloodSugar: true,
  recordedByUserId: true,
} satisfies Prisma.PatientProgramRoundVitalsSelect;

function getDatabase(
  dependencies: PatientProgramRoundServiceDependencies,
): PatientProgramRoundDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientProgramRoundServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Round time could not be resolved");
  }

  return copy;
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2002") || isKnownRequestError(error, "P2034");
}

function normalizeDatabaseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002") || isKnownRequestError(error, "P2034")) {
    return new RoundConflictError("ข้อมูลครั้งนี้ถูกบันทึกพร้อมกับคำขออื่น กรุณาตรวจสอบข้อมูลล่าสุด");
  }

  if (isKnownRequestError(error, "P2003")) {
    return new ConflictError("ข้อมูลความสัมพันธ์ของครั้งนี้ไม่สอดคล้องกัน");
  }

  return new InfrastructureError("Program round could not be saved");
}

async function runSerializable<T>(
  database: PatientProgramRoundDatabase,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  retryLimit: number,
): Promise<T> {
  let retryCount = 0;

  while (true) {
    try {
      return await database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (!isRetryableTransactionError(error) || retryCount >= retryLimit) {
        throw error;
      }

      retryCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** (retryCount - 1) + Math.floor(Math.random() * 10)));
    }
  }
}

async function runRoundWrite<TInput, TResult>(
  schema: { safeParse: (input: unknown) => { success: true; data: TInput } | { success: false } },
  invalidMessage: string,
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramRoundServiceDependencies,
  operation: (transaction: Prisma.TransactionClient, actor: ActorContext, input: TInput, now: Date) => Promise<TResult>,
): Promise<TResult> {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError(invalidMessage);
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => operation(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

function writeResult(
  operation: PatientProgramRoundOperation,
  context: ActivePatientProgramMutationContext,
  roundNumber: number,
): PatientProgramRoundWriteResult {
  return {
    operation,
    patientProgramId: context.program.id,
    patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId,
    roundNumber,
  };
}

function auditMetadata(context: ActivePatientProgramMutationContext, roundNumber: number) {
  return {
    patientProgramId: context.program.id,
    patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId,
    hospitalId: context.access.target.hospitalId,
    roundNumber,
  };
}

type PersistedRoundVitals = Prisma.PatientProgramRoundVitalsGetPayload<{
  select: typeof roundVitalsSelect;
}>;

function hasSameVitals(
  existing: PersistedRoundVitals,
  input: RoundVitalsRequest,
  actorUserId: string,
  programId: string,
): boolean {
  return (
    existing.patientProgramId === programId &&
    existing.roundNumber === input.roundNumber &&
    existing.recordedByUserId === actorUserId &&
    existing.serviceDate.toISOString().slice(0, 10) === input.serviceDate &&
    existing.weight === (input.weight ?? null) &&
    existing.heightCm === (input.heightCm ?? null) &&
    existing.waistCircumference === (input.waistCircumference ?? null) &&
    existing.systolicBloodPressure === (input.systolicBloodPressure ?? null) &&
    existing.diastolicBloodPressure === (input.diastolicBloodPressure ?? null) &&
    existing.bloodSugar === (input.bloodSugar ?? null)
  );
}

/**
 * SR-D12 / R1-B3: the round 1 actor may write only the preferred name and an empty occupation of the
 * hospital profile, guarded by the profile version (optimistic concurrency).
 */
async function writeRoundProfileFields(
  transaction: Prisma.TransactionClient,
  context: ActivePatientProgramMutationContext,
  input: { preferredName?: string | null; occupation?: string | null; profileVersion?: number | null },
): Promise<void> {
  const preferredName = input.preferredName ?? null;
  const occupation = input.occupation ?? null;

  if (!preferredName && !occupation) {
    return;
  }

  const relationshipId = context.access.patient.patientHospitalRelationshipId;
  const profile = await transaction.patientHospitalProfile.findUnique({
    where: { patientHospitalRelationshipId: relationshipId },
    select: { id: true, version: true, occupation: true, preferredName: true },
  });

  if ((profile?.version ?? null) !== (input.profileVersion ?? null)) {
    throw new RoundConflictError("ข้อมูลผู้ป่วยถูกแก้ไขโดยคำขออื่น กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่");
  }

  if (occupation && profile?.occupation) {
    throw new RoundConflictError("อาชีพของผู้ป่วยบันทึกไว้แล้ว แก้ไขได้ที่ข้อมูลผู้ป่วย");
  }

  const data = {
    ...(preferredName ? { preferredName } : {}),
    ...(occupation ? { occupation } : {}),
  };

  if (profile) {
    const updated = await transaction.patientHospitalProfile.updateMany({
      where: { id: profile.id, version: profile.version },
      data: { ...data, version: { increment: 1 } },
    });

    if (updated.count !== 1) {
      throw new RoundConflictError("ข้อมูลผู้ป่วยถูกแก้ไขโดยคำขออื่น กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่");
    }
  } else {
    await transaction.patientHospitalProfile.create({
      data: { patientHospitalRelationshipId: relationshipId, ...data },
      select: { id: true },
    });
  }

  await recordAuditEvent(
    {
      actorUserId: context.access.actor.userId,
      action: "patient_program_round.profile_updated",
      resourceType: "PatientHospitalProfile",
      resourceId: relationshipId,
      metadata: {
        ...auditMetadata(context, SERVICE_ONE_HOME_ROUND),
        fields: Object.keys(data).join(","),
      },
    },
    transaction,
  );
}

/**
 * The vitals step is DONE only with every measurement, so while the round is writable the missing
 * values of an existing record may be added. Recorded values stay as they are.
 */
async function supplementVitalsInTransaction(
  transaction: Prisma.TransactionClient,
  context: ActivePatientProgramMutationContext,
  existing: PersistedRoundVitals,
  input: RoundVitalsRequest,
): Promise<PatientProgramRoundVitalsResult> {
  if (input.preferredName || input.occupation) {
    throw new ValidationError("Profile fields are not part of a round vitals supplement");
  }

  if (existing.serviceDate.toISOString().slice(0, 10) !== input.serviceDate) {
    throw new RoundConflictError("วันที่ให้บริการไม่ตรงกับที่บันทึกไว้ของครั้งนี้ กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่");
  }

  const added: Partial<Record<VitalsMeasurement, number>> = {};

  for (const measurement of VITALS_MEASUREMENTS) {
    const value = input[measurement] ?? null;

    if (value === null || existing[measurement] === value) {
      continue;
    }

    if (existing[measurement] !== null) {
      throw new RoundConflictError("ค่าที่บันทึกไว้แล้วแก้ไขไม่ได้ เพิ่มได้เฉพาะค่าที่ยังขาด");
    }

    added[measurement] = value;
  }

  const fields = Object.keys(added) as VitalsMeasurement[];

  if (fields.length === 0) {
    // Same values as recorded (e.g. a retried supplement): nothing to add.
    return { ...writeResult("ALREADY_RECORDED", context, existing.roundNumber), roundVitalsId: existing.id };
  }

  const updated = await transaction.patientProgramRoundVitals.updateMany({
    where: { id: existing.id, ...Object.fromEntries(fields.map((field) => [field, null])) },
    data: added,
  });

  if (updated.count !== 1) {
    throw new RoundConflictError("สัญญาณชีพของครั้งนี้ถูกแก้ไขโดยคำขออื่น กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่");
  }

  await recordAuditEvent(
    {
      actorUserId: context.access.actor.userId,
      action: "patient_program_round.vitals_supplemented",
      resourceType: "PatientProgramRoundVitals",
      resourceId: existing.id,
      metadata: { ...auditMetadata(context, existing.roundNumber), fields: fields.join(",") },
    },
    transaction,
  );

  return { ...writeResult("RECORDED", context, existing.roundNumber), roundVitalsId: existing.id };
}

async function recordVitalsInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: RoundVitalsRequest,
  now: Date,
): Promise<PatientProgramRoundVitalsResult> {
  if (isServiceDateAfter(input.serviceDate, now)) {
    throw new ValidationError("The round service date cannot be in the future");
  }

  const programId = input.patientProgramId.toLowerCase();
  const context = await lockActivePatientProgram(transaction, actor, programId);
  const { access, program } = context;
  const relationshipId = access.patient.patientHospitalRelationshipId;

  const byNonce = await transaction.patientProgramRoundVitals.findUnique({
    where: { submissionNonce: input.submissionNonce },
    select: roundVitalsSelect,
  });

  if (byNonce) {
    if (!hasSameVitals(byNonce, input, access.actor.userId, program.id)) {
      throw new ConflictError("This round vitals submission token has already been used");
    }

    return { ...writeResult("ALREADY_RECORDED", context, byNonce.roundNumber), roundVitalsId: byNonce.id };
  }

  const existing = await transaction.patientProgramRoundVitals.findUnique({
    where: {
      patientProgramId_roundNumber: {
        patientProgramId: program.id,
        roundNumber: input.roundNumber,
      },
    },
    select: roundVitalsSelect,
  });

  await assertRoundWritable(transaction, program.id, input.roundNumber);

  if (existing) {
    return supplementVitalsInTransaction(transaction, context, existing, input);
  }

  const record = await transaction.patientProgramRoundVitals.create({
    data: {
      patientProgramId: program.id,
      patientHospitalRelationshipId: relationshipId,
      roundNumber: input.roundNumber,
      serviceDate: serviceDateToUtcDate(input.serviceDate),
      weight: input.weight ?? null,
      heightCm: input.heightCm ?? null,
      waistCircumference: input.waistCircumference ?? null,
      systolicBloodPressure: input.systolicBloodPressure ?? null,
      diastolicBloodPressure: input.diastolicBloodPressure ?? null,
      bloodSugar: input.bloodSugar ?? null,
      recordedByUserId: access.actor.userId,
      submissionNonce: input.submissionNonce,
      recordedAt: now,
      createdAt: now,
    },
    select: roundVitalsSelect,
  });

  if (input.roundNumber === SERVICE_ONE_HOME_ROUND) {
    await writeRoundProfileFields(transaction, context, input);
  }

  await recordAuditEvent(
    {
      actorUserId: access.actor.userId,
      action: "patient_program_round.vitals_recorded",
      resourceType: "PatientProgramRoundVitals",
      resourceId: record.id,
      metadata: auditMetadata(context, input.roundNumber),
    },
    transaction,
  );

  return { ...writeResult("RECORDED", context, record.roundNumber), roundVitalsId: record.id };
}

async function recordProfileInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: RoundProfileRequest,
): Promise<PatientProgramRoundWriteResult> {
  const context = await lockActivePatientProgram(transaction, actor, input.patientProgramId.toLowerCase());
  await assertRoundWritable(transaction, context.program.id, SERVICE_ONE_HOME_ROUND);
  await writeRoundProfileFields(transaction, context, input);

  return writeResult("RECORDED", context, SERVICE_ONE_HOME_ROUND);
}

/** Resolves the existing Program-level result a review points at, or null when none exists. */
async function findReviewTarget(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
  toolCode: RoundReviewRequest["toolCode"],
): Promise<{ linkedRecordId: string | null } | null> {
  if (toolCode === "HEALTH_PATH") {
    const followup = await transaction.patientProgramRoundVitals.findFirst({
      where: { patientProgramId, roundNumber: 1 },
      select: { id: true },
    });

    return followup ? { linkedRecordId: null } : null;
  }

  // R2-C: the reviewed instrument's own screening, or a legacy combined one.
  const screening = await transaction.screeningAssessment.findFirst({
    where: { patientProgramId, instrument: { in: ["COMBINED", toolCode] } },
    orderBy: { submittedAt: "asc" },
    select: { id: true },
  });

  return screening ? { linkedRecordId: screening.id } : null;
}

async function recordReviewInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: RoundReviewRequest,
  now: Date,
): Promise<PatientProgramRoundReviewResult> {
  const roundNumber = input.roundNumber;

  if (!isValidRoundNumber(roundNumber)) {
    throw new ValidationError("The program round is invalid");
  }

  const context = await lockActivePatientProgram(transaction, actor, input.patientProgramId.toLowerCase());
  const { access, program } = context;

  const byNonce = await transaction.patientProgramRoundActivity.findUnique({
    where: { submissionNonce: input.submissionNonce },
    select: {
      id: true,
      patientProgramId: true,
      roundNumber: true,
      toolCode: true,
      source: true,
      recordedByUserId: true,
    },
  });

  if (byNonce) {
    if (
      byNonce.patientProgramId !== program.id ||
      byNonce.roundNumber !== roundNumber ||
      byNonce.toolCode !== input.toolCode ||
      byNonce.recordedByUserId !== access.actor.userId
    ) {
      throw new ConflictError("This round activity submission token has already been used");
    }

    return {
      ...writeResult("ALREADY_RECORDED", context, roundNumber),
      roundActivityId: byNonce.id,
      toolCode: byNonce.toolCode,
      source: byNonce.source,
    };
  }

  if (input.toolCode === "HEALTH_PATH" && roundNumber < HEALTH_PATH_REVIEW_ROUND) {
    throw new ValidationError("The health path review requires round 6 or later");
  }

  if (input.toolCode !== "HEALTH_PATH" && roundNumber === SERVICE_ONE_HOME_ROUND) {
    throw new RoundConflictError("เครื่องมือนี้บันทึกในครั้งที่ 1 ไม่ต้องทบทวนซ้ำในครั้งเดียวกัน");
  }

  if (input.toolCode === "HEALTH_PATH") await assertActivePlanItem(transaction, program.id, roundNumber, "HEALTH_PATH_REVIEW");
  const target = await findReviewTarget(transaction, program.id, input.toolCode);

  if (!target) {
    throw new RoundConflictError(
      input.toolCode === "HEALTH_PATH"
        ? "บันทึกสัญญาณชีพของครั้งที่ 1 ก่อน จึงจะทบทวนเส้นทางสุขภาพได้"
        : "ยังไม่มีผลแบบประเมินให้ทบทวน กรุณาบันทึกในครั้งที่ 1 ก่อน",
    );
  }

  await assertRoundWritable(transaction, program.id, roundNumber);

  const linkedRecordType = target.linkedRecordId
    ? (SERVICE_ONE_TOOL_LINKED_RECORD_TYPES[input.toolCode] ?? null)
    : null;
  const { entry, created } = await ensureRoundLedgerEntry(transaction, {
    patientProgramId: program.id,
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    roundNumber,
    toolCode: input.toolCode,
    source: await classifyRoundActivity(transaction, program.id, roundNumber, input.toolCode),
    mode: "REVIEWED",
    linkedRecordType,
    linkedRecordId: linkedRecordType ? target.linkedRecordId : null,
    recordedByUserId: access.actor.userId,
    performedAt: now,
    submissionNonce: input.submissionNonce,
  });

  if (created) {
    await recordAuditEvent(
      {
        actorUserId: access.actor.userId,
        action: "patient_program_round.activity_reviewed",
        resourceType: "PatientProgramRoundActivity",
        resourceId: entry.id,
        metadata: {
          ...auditMetadata(context, roundNumber),
          toolCode: input.toolCode,
          source: entry.source,
          mode: entry.mode,
        },
      },
      transaction,
    );
  }

  return {
    ...writeResult(created ? "RECORDED" : "ALREADY_RECORDED", context, roundNumber),
    roundActivityId: entry.id,
    toolCode: entry.toolCode,
    source: entry.source,
  };
}

async function loadRoundStatus(
  transaction: Prisma.TransactionClient,
  context: ActivePatientProgramMutationContext,
  roundNumber: number,
) {
  const record = await loadProgramRoundRecord(
    transaction,
    context.program.id,
    context.access.patient.patientHospitalRelationshipId,
  );
  const facts = buildProgramRoundFacts(record);

  return computeRoundStatus(facts, roundNumber, roundPlan(facts, roundNumber));
}

const UNSKIPPABLE_STEP_MESSAGE = "This step cannot be skipped in the selected round";

function assertSkipRound(roundNumber: number): number {
  if (!isValidRoundNumber(roundNumber)) {
    throw new ValidationError(UNSKIPPABLE_STEP_MESSAGE);
  }

  return roundNumber;
}

/**
 * SR-D3 on plans (ADR-0022, FR-1b): only an active, skippable item of the requested round's plan can be
 * skipped or unskipped. A skip belongs to that one item, so several CUSTOM items each keep their own.
 */
async function loadSkippablePlanItem(
  transaction: Prisma.TransactionClient,
  patientProgramId: string,
  roundNumber: number,
  planItemId: string,
): Promise<{ id: string; stepCode: RoundStepCode }> {
  const item = await transaction.patientProgramRoundPlanItem.findUnique({
    where: { id: planItemId },
    select: { id: true, patientProgramId: true, roundNumber: true, stepCode: true, removedAt: true },
  });

  if (
    !item ||
    item.patientProgramId !== patientProgramId ||
    item.roundNumber !== roundNumber ||
    item.removedAt !== null ||
    !ROUND_ITEM_CATALOG[item.stepCode].skippable
  ) {
    throw new ValidationError(UNSKIPPABLE_STEP_MESSAGE);
  }

  return { id: item.id, stepCode: item.stepCode };
}

async function skipStepInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: RoundStepSkipRequest,
): Promise<PatientProgramRoundWriteResult> {
  const roundNumber = assertSkipRound(input.roundNumber);
  const planItemId = input.planItemId.toLowerCase();
  const context = await lockActivePatientProgram(transaction, actor, input.patientProgramId.toLowerCase());
  const existing = await transaction.patientProgramRoundStepSkip.findUnique({
    where: { planItemId },
    select: { patientProgramId: true, roundNumber: true, reasonCode: true, note: true },
  });

  if (existing && existing.patientProgramId === context.program.id && existing.roundNumber === roundNumber) {
    if (existing.reasonCode === input.reasonCode && existing.note === (input.note ?? null)) {
      return writeResult("ALREADY_RECORDED", context, roundNumber);
    }

    throw new RoundConflictError("รายการนี้ถูกข้ามไว้แล้ว ยกเลิกการข้ามก่อนหากต้องการเปลี่ยนเหตุผล");
  }

  await assertRoundWritable(transaction, context.program.id, roundNumber);
  const item = await loadSkippablePlanItem(transaction, context.program.id, roundNumber, planItemId);
  const status = await loadRoundStatus(transaction, context, roundNumber);

  if (status.steps.find((state) => state.planItemId === item.id)?.status === "DONE") {
    throw new RoundConflictError("รายการนี้บันทึกแล้ว จึงไม่ต้องข้าม");
  }

  await transaction.patientProgramRoundStepSkip.create({
    data: {
      patientProgramId: context.program.id,
      patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId,
      roundNumber,
      planItemId: item.id,
      stepCode: item.stepCode,
      reasonCode: input.reasonCode,
      note: input.note ?? null,
      skippedByUserId: context.access.actor.userId,
    },
    select: { id: true },
  });

  // The note may contain patient details, so only the reason code is audited.
  await recordAuditEvent(
    {
      actorUserId: context.access.actor.userId,
      action: "patient_program_round.step_skipped",
      resourceType: "PatientProgramRoundStepSkip",
      resourceId: context.program.id,
      metadata: {
        ...auditMetadata(context, roundNumber),
        planItemId: item.id,
        stepCode: item.stepCode,
        reasonCode: input.reasonCode,
      },
    },
    transaction,
  );

  return writeResult("RECORDED", context, roundNumber);
}

async function unskipStepInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: RoundStepUnskipRequest,
): Promise<PatientProgramRoundWriteResult> {
  const roundNumber = assertSkipRound(input.roundNumber);
  const context = await lockActivePatientProgram(transaction, actor, input.patientProgramId.toLowerCase());
  await assertRoundWritable(transaction, context.program.id, roundNumber);
  const item = await loadSkippablePlanItem(
    transaction,
    context.program.id,
    roundNumber,
    input.planItemId.toLowerCase(),
  );
  const removed = await transaction.patientProgramRoundStepSkip.deleteMany({ where: { planItemId: item.id } });

  if (removed.count === 0) {
    return writeResult("ALREADY_RECORDED", context, roundNumber);
  }

  await recordAuditEvent(
    {
      actorUserId: context.access.actor.userId,
      action: "patient_program_round.step_unskipped",
      resourceType: "PatientProgramRoundStepSkip",
      resourceId: context.program.id,
      metadata: { ...auditMetadata(context, roundNumber), planItemId: item.id, stepCode: item.stepCode },
    },
    transaction,
  );

  return writeResult("RECORDED", context, roundNumber);
}

async function completeRoundInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: RoundCompletionRequest,
  now: Date,
): Promise<PatientProgramRoundWriteResult> {
  if (!isValidRoundNumber(input.roundNumber)) {
    throw new ValidationError("The program round is invalid");
  }

  const roundNumber = input.roundNumber;
  const context = await lockActivePatientProgram(transaction, actor, input.patientProgramId.toLowerCase());
  const byNonce = await transaction.patientProgramRoundCompletion.findUnique({
    where: { submissionNonce: input.submissionNonce },
    select: { patientProgramId: true, roundNumber: true },
  });

  if (byNonce) {
    if (byNonce.patientProgramId !== context.program.id || byNonce.roundNumber !== roundNumber) {
      throw new ConflictError("This round completion token has already been used");
    }

    return { ...writeResult("ALREADY_RECORDED", context, roundNumber), ...completionCounts(await loadRoundStatus(transaction, context, roundNumber)) };
  }

  const existing = await transaction.patientProgramRoundCompletion.findUnique({
    where: { patientProgramId_roundNumber: { patientProgramId: context.program.id, roundNumber } },
    select: { id: true },
  });

  if (existing) {
    return { ...writeResult("ALREADY_RECORDED", context, roundNumber), ...completionCounts(await loadRoundStatus(transaction, context, roundNumber)) };
  }

  await assertRoundWritable(transaction, context.program.id, roundNumber);
  // SR-D1 re-computed inside the transaction from the same rule the views use.
  const status = await loadRoundStatus(transaction, context, roundNumber);

  if (!status.canComplete) {
    throw new RoundConflictError("ต้องทำอย่างน้อย 1 รายการในแผนก่อนจบบริการ");
  }

  const notDone = status.steps.filter((step) => step.status === "TODO");
  if (notDone.length > 0) {
    await transaction.patientProgramRoundStepSkip.createMany({ data: notDone.map((step) => {
      if (!step.planItemId) throw new RoundConflictError("รายการในแผนยังไม่ได้เปิดบริการ");
      return { patientProgramId: context.program.id, patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId, roundNumber, planItemId: step.planItemId, stepCode: step.code, reasonCode: "NOT_DONE_AT_CLOSE" as const, note: null, skippedByUserId: context.access.actor.userId };
    }) });
  }

  const completion = await transaction.patientProgramRoundCompletion.create({
    // completedAt uses the database clock (column default).
    data: {
      patientProgramId: context.program.id,
      patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId,
      roundNumber,
      completedByUserId: context.access.actor.userId,
      submissionNonce: input.submissionNonce,
    },
    select: { id: true },
  });

  await recordAuditEvent(
    {
      actorUserId: context.access.actor.userId,
      action: "patient_program_round.completed",
      resourceType: "PatientProgramRoundCompletion",
      resourceId: completion.id,
      metadata: {
        ...auditMetadata(context, roundNumber),
        notDoneSteps: notDone.length,
        doneSteps: status.steps.filter((state) => state.status === "DONE").length,
        skippedSteps: status.steps.filter((state) => state.status === "SKIPPED").length,
      },
    },
    transaction,
  );

  // ADR-0022: the next guideline round opens with its guideline plan in the same transaction.
  if (roundNumber < GUIDELINE_ROUND_COUNT) {
    await openGuidelineRound(transaction, {
      patientProgramId: context.program.id,
      patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId,
      roundNumber: roundNumber + 1,
      openedByUserId: context.access.actor.userId,
      openedAt: now,
    });
  }

  return { ...writeResult("RECORDED", context, roundNumber), ...completionCounts(status) };
}

function completionCounts(status: Awaited<ReturnType<typeof loadRoundStatus>>): { done: number; skipped: number; notDone: number } {
  return {
    done: status.steps.filter((step) => step.status === "DONE").length,
    skipped: status.steps.filter((step) => step.status === "SKIPPED" && step.skip?.reasonCode !== "NOT_DONE_AT_CLOSE").length,
    notDone: status.steps.filter((step) => step.status === "TODO" || step.skip?.reasonCode === "NOT_DONE_AT_CLOSE").length,
  };
}

export async function recordPatientProgramRoundVitals(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramRoundServiceDependencies = {},
): Promise<PatientProgramRoundVitalsResult> {
  return runRoundWrite(
    roundVitalsRequestSchema,
    "Round vitals submission data is invalid",
    actor,
    input,
    dependencies,
    recordVitalsInTransaction,
  );
}

export async function recordPatientProgramRoundProfile(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramRoundServiceDependencies = {},
): Promise<PatientProgramRoundWriteResult> {
  return runRoundWrite(
    roundProfileRequestSchema,
    "Round profile submission data is invalid",
    actor,
    input,
    dependencies,
    (transaction, authorizedActor, parsed) => recordProfileInTransaction(transaction, authorizedActor, parsed),
  );
}

export async function recordPatientProgramRoundReview(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramRoundServiceDependencies = {},
): Promise<PatientProgramRoundReviewResult> {
  return runRoundWrite(
    roundReviewRequestSchema,
    "Round activity submission data is invalid",
    actor,
    input,
    dependencies,
    recordReviewInTransaction,
  );
}

export async function skipPatientProgramRoundStep(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramRoundServiceDependencies = {},
): Promise<PatientProgramRoundWriteResult> {
  return runRoundWrite(
    roundStepSkipRequestSchema,
    "Round step skip data is invalid",
    actor,
    input,
    dependencies,
    (transaction, authorizedActor, parsed) => skipStepInTransaction(transaction, authorizedActor, parsed),
  );
}

export async function unskipPatientProgramRoundStep(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramRoundServiceDependencies = {},
): Promise<PatientProgramRoundWriteResult> {
  return runRoundWrite(
    roundStepUnskipRequestSchema,
    "Round step unskip data is invalid",
    actor,
    input,
    dependencies,
    (transaction, authorizedActor, parsed) => unskipStepInTransaction(transaction, authorizedActor, parsed),
  );
}

export async function completePatientProgramRound(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramRoundServiceDependencies = {},
): Promise<PatientProgramRoundWriteResult> {
  return runRoundWrite(
    roundCompletionRequestSchema,
    "Round completion data is invalid",
    actor,
    input,
    dependencies,
    completeRoundInTransaction,
  );
}

export const patientProgramRoundServiceInternals = {
  auditMetadata,
  loadRoundStatus,
  runRoundWrite,
  writeResult,
  completeRoundInTransaction,
  findReviewTarget,
  hasSameVitals,
  normalizeDatabaseError,
  recordProfileInTransaction,
  recordReviewInTransaction,
  recordVitalsInTransaction,
  runSerializable,
  skipStepInTransaction,
  unskipStepInTransaction,
  writeRoundProfileFields,
};
