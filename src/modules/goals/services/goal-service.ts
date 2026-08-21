import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  resolvePatientProgramByIdAccessContext,
  type PatientProgramAccessContext,
} from "@/modules/patient-program/services/patient-program-access-service";
import { PATIENT_PROGRAM_MANAGE_CAPABILITY } from "@/modules/patient-program/policies/patient-program-policy";
import { lockActivePatientProgram } from "@/modules/patient-program/services/patient-program-lifecycle-service";
import { getAccessibleScreeningSummary } from "@/modules/screening/services/screening-query-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import { getGoalTemplate, GOAL_TEMPLATE_KEY, GOAL_TEMPLATE_VERSION } from "../domain/goal-templates";
import { validateGoalPlanInput, type ValidatedGoalPlan } from "../domain/goal-validation";
import { GOAL_PLAN_CAPABILITY } from "../policies/goal-policy";
import {
  goalPlanProgramSubmitRequestSchema,
  goalPlanSubmitRequestSchema,
  type GoalPlanProgramSubmitRequest,
  type GoalPlanSubmitRequest,
} from "../schemas/goal-schemas";
import {
  resolveGoalAccessContext,
  type GoalAccessContext,
} from "./goal-access-service";

export type GoalDatabase = PrismaClient;

export type GoalServiceDependencies = {
  database?: GoalDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type GoalPlanSubmissionResult = {
  goalPlanId: string;
  patientProgramId: string | null;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  roundNumber: number;
  createdAt: Date;
};

type GoalPlanRetrySnapshot = {
  id: string;
  patientHospitalRelationshipId: string;
  patientProgramId: string | null;
  createdByUserId: string;
  sourceScreeningAssessmentId: string | null;
  submissionNonce: string;
  templateKey: string;
  templateVersion: string;
  roundNumber: number;
  primaryGoalCode: string;
  primaryGoalNote: string | null;
  weeklyNote: string | null;
  createdAt: Date;
  items: Array<{
    activityCode: string;
    targetDays: number;
    targetValue: number | null;
    targetUnit: string | null;
    sortOrder: number;
  }>;
};

const DEFAULT_TRANSACTION_RETRIES = 2;

const goalPlanRetrySelect = {
  id: true,
  patientHospitalRelationshipId: true,
  patientProgramId: true,
  createdByUserId: true,
  sourceScreeningAssessmentId: true,
  submissionNonce: true,
  templateKey: true,
  templateVersion: true,
  roundNumber: true,
  primaryGoalCode: true,
  primaryGoalNote: true,
  weeklyNote: true,
  createdAt: true,
  items: {
    orderBy: { sortOrder: "asc" },
    select: {
      activityCode: true,
      targetDays: true,
      targetValue: true,
      targetUnit: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.PatientGoalPlanSelect;

type GoalPlanRetryRecord = Prisma.PatientGoalPlanGetPayload<{
  select: typeof goalPlanRetrySelect;
}>;

function getDatabase(dependencies: GoalServiceDependencies): GoalDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: GoalServiceDependencies): Date {
  return dependencies.now ? new Date(dependencies.now().getTime()) : new Date();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2034") || isKnownRequestError(error, "P2002");
}

function normalizeDatabaseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002") || isKnownRequestError(error, "P2034")) {
    return new ConflictError("The Goal Plan submission conflicted with another request");
  }

  return new InfrastructureError("Goal Plan could not be submitted");
}

async function runSerializable<T>(
  database: GoalDatabase,
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
    }
  }
}

function canonicalizeItems(items: GoalPlanRetrySnapshot["items"]): GoalPlanRetrySnapshot["items"] {
  return [...items]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({
      activityCode: item.activityCode,
      targetDays: item.targetDays,
      targetValue: item.targetValue,
      targetUnit: item.targetUnit,
      sortOrder: item.sortOrder,
    }));
}

function hasSamePlanPayload(
  existing: GoalPlanRetryRecord,
  actor: ActorContext,
  input: ValidatedGoalPlan,
  patientProgramId: string | null = null,
): boolean {
  return (
    existing.patientHospitalRelationshipId === input.patientHospitalRelationshipId &&
    (existing.patientProgramId ?? null) === patientProgramId &&
    existing.createdByUserId === actor.userId &&
    existing.sourceScreeningAssessmentId === input.sourceScreeningAssessmentId &&
    existing.submissionNonce === input.submissionNonce &&
    existing.templateKey === GOAL_TEMPLATE_KEY &&
    existing.templateVersion === GOAL_TEMPLATE_VERSION &&
    existing.primaryGoalCode === input.primaryGoalCode &&
    existing.primaryGoalNote === input.primaryGoalNote &&
    existing.weeklyNote === input.weeklyNote &&
    JSON.stringify(canonicalizeItems(existing.items)) ===
      JSON.stringify(canonicalizeItems(input.items))
  );
}

async function assertSourceScreeningIsAccessible(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: ValidatedGoalPlan,
): Promise<void> {
  if (!input.sourceScreeningAssessmentId) {
    return;
  }

  await getAccessibleScreeningSummary(
    actor,
    input.patientHospitalRelationshipId,
    input.sourceScreeningAssessmentId,
    { database: transaction },
  );
}

function toSubmissionResult(input: {
  goalPlanId: string;
  patientProgramId: string | null;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  roundNumber: number;
  createdAt: Date;
}): GoalPlanSubmissionResult {
  return input;
}

function toGoalAccessContext(programAccess: PatientProgramAccessContext): GoalAccessContext {
  return {
    patient: {
      patientHospitalRelationshipId: programAccess.patient.patientHospitalRelationshipId,
      displayName: programAccess.patient.displayName,
      hospitalNumber: programAccess.patient.hospitalNumber,
      hospital: programAccess.patient.hospital,
    },
    target: programAccess.target,
  };
}

function toRelationshipGoalPlanInput(
  input: GoalPlanProgramSubmitRequest,
  patientHospitalRelationshipId: string,
): GoalPlanSubmitRequest {
  const { patientProgramId, ...payload } = input;
  void patientProgramId;

  return {
    patientHospitalRelationshipId,
    ...payload,
  };
}

async function createInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: GoalPlanSubmitRequest,
  now: Date,
  patientProgramId: string | null = null,
  programAccessOverride?: PatientProgramAccessContext,
): Promise<GoalPlanSubmissionResult> {
  const normalizedProgramId = patientProgramId?.toLowerCase() ?? null;
  const programAccess = normalizedProgramId
    ? programAccessOverride ??
      (await resolvePatientProgramByIdAccessContext(
        actor,
        normalizedProgramId,
        PATIENT_PROGRAM_MANAGE_CAPABILITY,
        transaction,
      ))
    : null;
  let access = programAccess
    ? toGoalAccessContext(programAccess)
    : await resolveGoalAccessContext(
        actor,
        input.patientHospitalRelationshipId,
        GOAL_PLAN_CAPABILITY,
        transaction,
      );
  let authoritativeActor = programAccess?.actor ?? actor;
  const template = getGoalTemplate(GOAL_TEMPLATE_KEY, GOAL_TEMPLATE_VERSION);

  if (!template) {
    throw new InfrastructureError("Goal Plan prototype definitions are unavailable");
  }

  const validated = validateGoalPlanInput(
    normalizedProgramId
      ? {
          ...input,
          patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        }
      : input,
    template,
  );
  await assertSourceScreeningIsAccessible(transaction, authoritativeActor, validated);

  const existing = await transaction.patientGoalPlan.findUnique({
    where: { submissionNonce: validated.submissionNonce },
    select: goalPlanRetrySelect,
  });

  if (existing) {
    if (!hasSamePlanPayload(existing, authoritativeActor, validated, normalizedProgramId)) {
      throw new ConflictError("This Goal Plan submission token has already been used");
    }

    return toSubmissionResult({
      goalPlanId: existing.id,
      patientProgramId: existing.patientProgramId ?? null,
      patientHospitalRelationshipId: existing.patientHospitalRelationshipId,
      hospitalId: access.target.hospitalId,
      roundNumber: existing.roundNumber,
      createdAt: existing.createdAt,
    });
  }

  if (normalizedProgramId) {
    const locked = await lockActivePatientProgram(transaction, actor, normalizedProgramId);
    access = toGoalAccessContext(locked.access);
    authoritativeActor = locked.access.actor;
  }

  const latest = await transaction.patientGoalPlan.findFirst({
    where: normalizedProgramId
      ? { patientProgramId: normalizedProgramId }
      : {
          patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
          patientProgramId: null,
        },
    orderBy: [{ roundNumber: "desc" }],
    select: { roundNumber: true },
  });
  const roundNumber = (latest?.roundNumber ?? 0) + 1;

  const plan = await transaction.patientGoalPlan.create({
    data: {
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      patientProgramId: normalizedProgramId,
      createdByUserId: authoritativeActor.userId,
      sourceScreeningAssessmentId: validated.sourceScreeningAssessmentId,
      submissionNonce: validated.submissionNonce,
      templateKey: template.key,
      templateVersion: template.version,
      roundNumber,
      primaryGoalCode: validated.primaryGoalCode,
      primaryGoalNote: validated.primaryGoalNote,
      weeklyNote: validated.weeklyNote,
      createdAt: now,
      items: {
        create: validated.items.map((item) => ({
          activityCode: item.activityCode,
          targetDays: item.targetDays,
          targetValue: item.targetValue,
          targetUnit: item.targetUnit,
          sortOrder: item.sortOrder,
          createdAt: now,
        })),
      },
    },
    select: {
      id: true,
      createdAt: true,
      roundNumber: true,
    },
  });

  await recordAuditEvent(
    {
      actorUserId: authoritativeActor.userId,
      action: "goal_plan.created",
      resourceType: "PatientGoalPlan",
      resourceId: plan.id,
      metadata: {
        goalPlanId: plan.id,
        ...(normalizedProgramId ? { patientProgramId: normalizedProgramId } : {}),
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
        hospitalId: access.target.hospitalId,
        roundNumber: plan.roundNumber,
        templateVersion: template.version,
        ...(validated.sourceScreeningAssessmentId
          ? { sourceScreeningAssessmentId: validated.sourceScreeningAssessmentId }
          : {}),
      },
    },
    transaction,
  );

  return toSubmissionResult({
    goalPlanId: plan.id,
    patientProgramId: normalizedProgramId,
    patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    hospitalId: access.target.hospitalId,
    roundNumber: plan.roundNumber,
    createdAt: plan.createdAt,
  });
}

export async function createGoalPlan(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: GoalServiceDependencies = {},
): Promise<GoalPlanSubmissionResult> {
  const parsed = goalPlanSubmitRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Goal Plan submission data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) => createInTransaction(transaction, actor, parsed.data, getNow(dependencies)),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function createGoalPlanForProgram(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: GoalServiceDependencies = {},
): Promise<GoalPlanSubmissionResult> {
  const parsed = goalPlanProgramSubmitRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Program Goal Plan submission data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        const programAccess = await resolvePatientProgramByIdAccessContext(
          actor,
          parsed.data.patientProgramId.toLowerCase(),
          PATIENT_PROGRAM_MANAGE_CAPABILITY,
          transaction,
        );

        return createInTransaction(
          transaction,
          actor,
          toRelationshipGoalPlanInput(
            parsed.data,
            programAccess.patient.patientHospitalRelationshipId,
          ),
          getNow(dependencies),
          parsed.data.patientProgramId,
          programAccess,
        );
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const goalServiceInternals = {
  assertSourceScreeningIsAccessible,
  canonicalizeItems,
  createInTransaction,
  hasSamePlanPayload,
  isRetryableTransactionError,
  normalizeDatabaseError,
  runSerializable,
  toGoalAccessContext,
  toRelationshipGoalPlanInput,
};

