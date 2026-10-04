import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, InfrastructureError } from "@/shared/errors/application-error";
import { fromWeightGoalDateCarrier, normalizeTargetWeightKg, type PersonalWeightGoalDto } from "../domain/personal-weight-goal";
import { assertPersonalWeightGoalSelf } from "../policies/personal-weight-goal-policy";
import { resolvePersonalWeightGoalOwner } from "./personal-weight-goal-access-service";

export const personalWeightGoalSelect = {
  id: true,
  targetWeightKg: true,
  targetDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PersonalWeightGoalSelect;

type PersonalWeightGoalRow = Prisma.PersonalWeightGoalGetPayload<{ select: typeof personalWeightGoalSelect }>;

export function toPersonalWeightGoalDto(row: PersonalWeightGoalRow): PersonalWeightGoalDto {
  const targetWeightKg = normalizeTargetWeightKg(row.targetWeightKg.toFixed(3));
  if (targetWeightKg === null) throw new InfrastructureError();
  return {
    id: row.id,
    targetWeightKg,
    targetDate: row.targetDate === null ? null : fromWeightGoalDateCarrier(row.targetDate),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOwnPersonalWeightGoal(
  actor: ActorContext | null | undefined,
  database: PrismaClient = getPrisma(),
): Promise<PersonalWeightGoalDto | null> {
  assertPersonalWeightGoalSelf(actor);
  try {
    const patientProfileId = await resolvePersonalWeightGoalOwner(actor, database);
    const row = await database.personalWeightGoal.findUnique({
      where: { patientProfileId },
      select: personalWeightGoalSelect,
    });
    return row === null ? null : toPersonalWeightGoalDto(row);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError();
  }
}
