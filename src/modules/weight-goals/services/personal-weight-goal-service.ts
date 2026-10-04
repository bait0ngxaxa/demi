import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import {
  fromWeightGoalDateCarrier,
  normalizeTargetWeightKg,
  toWeightGoalDateCarrier,
  weightGoalBangkokToday,
  type PersonalWeightGoalMutationResult,
} from "../domain/personal-weight-goal";
import { assertPersonalWeightGoalSelf } from "../policies/personal-weight-goal-policy";
import { personalWeightGoalCreateSchema, personalWeightGoalRemoveSchema, personalWeightGoalUpdateSchema } from "../schemas/personal-weight-goal-schemas";
import { resolvePersonalWeightGoalOwner } from "./personal-weight-goal-access-service";
import { personalWeightGoalSelect, toPersonalWeightGoalDto } from "./personal-weight-goal-query-service";

type Dependencies = { database?: PrismaClient; now?: () => Date };

function serverNow(dependencies: Dependencies): Date {
  const value = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(value.getTime())) throw new InfrastructureError();
  return new Date(value.getTime());
}

async function lockAndRevalidateOwner(actor: ActorContext, tx: Prisma.TransactionClient): Promise<string> {
  const patientProfileId = await resolvePersonalWeightGoalOwner(actor, tx);
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "PatientProfile"
    WHERE "id" = ${patientProfileId}::uuid
    FOR UPDATE
  `);
  if (locked.length !== 1 || locked[0]?.id !== patientProfileId) throw new ForbiddenError();
  const revalidatedPatientProfileId = await resolvePersonalWeightGoalOwner(actor, tx);
  if (revalidatedPatientProfileId !== patientProfileId) throw new ForbiddenError();
  return patientProfileId;
}

async function createUnusedGoalId(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = randomUUID();
    const goal = await tx.personalWeightGoal.findUnique({ where: { id }, select: { id: true } });
    const receipt = await tx.personalWeightGoalCreateReceipt.findUnique({ where: { intendedWeightGoalId: id }, select: { intendedWeightGoalId: true } });
    if (goal === null && receipt === null) return id;
  }
  throw new InfrastructureError();
}

function expectedVersionMatches(expectedUpdatedAt: string, currentUpdatedAt: Date): boolean {
  return new Date(expectedUpdatedAt).getTime() === currentUpdatedAt.getTime();
}

export async function createPersonalWeightGoal(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: Dependencies = {},
): Promise<PersonalWeightGoalMutationResult> {
  const parsed = personalWeightGoalCreateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  assertPersonalWeightGoalSelf(actor);
  const fields = parsed.data;

  try {
    return await (dependencies.database ?? getPrisma()).$transaction(async (tx): Promise<PersonalWeightGoalMutationResult> => {
      const patientProfileId = await lockAndRevalidateOwner(actor, tx);
      const priorReceipt = await tx.personalWeightGoalCreateReceipt.findUnique({
        where: { patientProfileId_submissionNonce: { patientProfileId, submissionNonce: fields.submissionNonce } },
        select: { intendedWeightGoalId: true },
      });
      if (priorReceipt) {
        const intendedGoal = await tx.personalWeightGoal.findFirst({
          where: { id: priorReceipt.intendedWeightGoalId, patientProfileId },
          select: personalWeightGoalSelect,
        });
        return intendedGoal === null
          ? { outcome: "CREATE_CONSUMED" }
          : { outcome: "REPLAY", goal: toPersonalWeightGoalDto(intendedGoal) };
      }

      const now = serverNow(dependencies);
      if (fields.targetDate !== null && fields.targetDate < weightGoalBangkokToday(now)) throw new ValidationError();

      const intendedWeightGoalId = await createUnusedGoalId(tx);
      await tx.personalWeightGoalCreateReceipt.create({
        data: { patientProfileId, submissionNonce: fields.submissionNonce, intendedWeightGoalId, createdAt: now },
      });

      const occupiedGoal = await tx.personalWeightGoal.findUnique({
        where: { patientProfileId },
        select: { id: true },
      });
      if (occupiedGoal !== null) return { outcome: "CREATE_CONSUMED" };

      const goal = await tx.personalWeightGoal.create({
        data: {
          id: intendedWeightGoalId,
          patientProfileId,
          targetWeightKg: new Prisma.Decimal(fields.targetWeightKg),
          targetDate: fields.targetDate === null ? null : toWeightGoalDateCarrier(fields.targetDate),
          createdAt: now,
          updatedAt: now,
        },
        select: personalWeightGoalSelect,
      });
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "personal_weight_goal.created",
        resourceType: "PersonalWeightGoal",
        resourceId: goal.id,
      }, tx);
      return { outcome: "CREATED", goal: toPersonalWeightGoalDto(goal) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error: unknown) {
    if (error instanceof ApplicationError && ["FORBIDDEN", "UNAUTHENTICATED", "VALIDATION"].includes(error.code)) throw error;
    return { outcome: "UNCONFIRMED" };
  }
}

export async function updatePersonalWeightGoal(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: Dependencies = {},
): Promise<PersonalWeightGoalMutationResult> {
  const parsed = personalWeightGoalUpdateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  assertPersonalWeightGoalSelf(actor);
  const fields = parsed.data;
  try {
    return await (dependencies.database ?? getPrisma()).$transaction(async (tx): Promise<PersonalWeightGoalMutationResult> => {
      const patientProfileId = await lockAndRevalidateOwner(actor, tx);
      const current = await tx.personalWeightGoal.findFirst({
        where: { id: fields.goalId, patientProfileId },
        select: personalWeightGoalSelect,
      });
      if (current === null) throw new NotFoundError();
      if (!expectedVersionMatches(fields.expectedUpdatedAt, current.updatedAt)) throw new ConflictError();

      const persistedTargetWeight = normalizeTargetWeightKg(current.targetWeightKg.toFixed(3));
      if (persistedTargetWeight === null) throw new InfrastructureError();
      const currentDate = current.targetDate === null ? null : fromWeightGoalDateCarrier(current.targetDate);
      if (persistedTargetWeight === fields.targetWeightKg && currentDate === fields.targetDate) {
        return { outcome: "NOOP", goal: toPersonalWeightGoalDto(current) };
      }

      const now = serverNow(dependencies);
      if (fields.targetDate !== null && fields.targetDate !== currentDate && fields.targetDate < weightGoalBangkokToday(now)) {
        throw new ValidationError();
      }
      const changed = await tx.personalWeightGoal.updateMany({
        where: { id: current.id, patientProfileId, updatedAt: current.updatedAt },
        data: {
          targetWeightKg: new Prisma.Decimal(fields.targetWeightKg),
          targetDate: fields.targetDate === null ? null : toWeightGoalDateCarrier(fields.targetDate),
          updatedAt: new Date(Math.max(now.getTime(), current.updatedAt.getTime() + 1)),
        },
      });
      if (changed.count !== 1) throw new ConflictError();
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "personal_weight_goal.updated",
        resourceType: "PersonalWeightGoal",
        resourceId: current.id,
      }, tx);
      const updated = await tx.personalWeightGoal.findFirst({
        where: { id: current.id, patientProfileId },
        select: personalWeightGoalSelect,
      });
      if (updated === null) throw new InfrastructureError();
      return { outcome: "UPDATED", goal: toPersonalWeightGoalDto(updated) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError();
  }
}

export async function removePersonalWeightGoal(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: Dependencies = {},
): Promise<PersonalWeightGoalMutationResult> {
  const parsed = personalWeightGoalRemoveSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  assertPersonalWeightGoalSelf(actor);
  const fields = parsed.data;
  try {
    return await (dependencies.database ?? getPrisma()).$transaction(async (tx): Promise<PersonalWeightGoalMutationResult> => {
      const patientProfileId = await lockAndRevalidateOwner(actor, tx);
      const current = await tx.personalWeightGoal.findFirst({
        where: { id: fields.goalId, patientProfileId },
        select: { id: true, updatedAt: true },
      });
      if (current === null) throw new NotFoundError();
      if (!expectedVersionMatches(fields.expectedUpdatedAt, current.updatedAt)) throw new ConflictError();
      const changed = await tx.personalWeightGoal.deleteMany({
        where: { id: current.id, patientProfileId, updatedAt: current.updatedAt },
      });
      if (changed.count !== 1) throw new ConflictError();
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "personal_weight_goal.deleted",
        resourceType: "PersonalWeightGoal",
        resourceId: current.id,
      }, tx);
      return { outcome: "DELETED", goalId: current.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError();
  }
}
