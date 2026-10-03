import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction, isRetryableSerializableTransactionError } from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ConflictError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { fromMealDateCarrier, toMealDateCarrier, MEAL_PAGE_SIZE, type PersonalMealDto, type PersonalMealPage } from "../domain/personal-meal";
import { mealIdSchema, mealListSchema } from "../schemas/personal-meal-schemas";
import { assertPersonalMealSelf } from "../policies/personal-meal-policy";
import { resolvePersonalMealOwner } from "./personal-meal-access-service";
import { decodeMealCursor, encodeMealCursor } from "./personal-meal-cursor";

export const personalMealSelect = { id: true, category: true, occurredOn: true, description: true, createdAt: true, updatedAt: true } satisfies Prisma.PersonalMealEntrySelect;
export function toPersonalMealDto(row: Prisma.PersonalMealEntryGetPayload<{ select: typeof personalMealSelect }>): PersonalMealDto {
  return { id: row.id, category: row.category, occurredOn: fromMealDateCarrier(row.occurredOn), description: row.description,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
export function normalizeMealError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  if (isRetryableSerializableTransactionError(error)) return new ConflictError();
  return new InfrastructureError();
}
export async function listOwnPersonalMeals(actor: ActorContext | null | undefined, input: unknown, database: PrismaClient = getPrisma()): Promise<PersonalMealPage> {
  assertPersonalMealSelf(actor);
  try {
    const parsed = mealListSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    return await runSerializableTransaction(database, async (tx) => {
      const patientProfileId = await resolvePersonalMealOwner(actor, tx);
      let seek: Prisma.PersonalMealEntryWhereInput = {};
      if (parsed.data.cursor) {
        const position = decodeMealCursor(actor, patientProfileId, parsed.data.cursor);
        const anchor = await tx.personalMealEntry.findFirst({ where: { id: position.id, patientProfileId }, select: personalMealSelect });
        if (!anchor) throw new NotFoundError();
        const dto = toPersonalMealDto(anchor);
        if (dto.occurredOn !== position.occurredOn || dto.createdAt !== position.createdAt || dto.updatedAt !== position.updatedAt) throw new ConflictError();
        const occurredOn = toMealDateCarrier(position.occurredOn);
        const createdAt = new Date(position.createdAt);
        seek = { OR: [{ occurredOn: { lt: occurredOn } }, { occurredOn, createdAt: { lt: createdAt } }, { occurredOn, createdAt, id: { lt: position.id } }] };
      }
      const rows = await tx.personalMealEntry.findMany({ where: { patientProfileId, ...seek },
        orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: MEAL_PAGE_SIZE + 1, select: personalMealSelect });
      const items = rows.slice(0, MEAL_PAGE_SIZE).map(toPersonalMealDto);
      const last = items.at(-1);
      return { items, nextCursor: rows.length > MEAL_PAGE_SIZE && last ? encodeMealCursor(actor, { version: 1, patientProfileId,
        id: last.id, occurredOn: last.occurredOn, createdAt: last.createdAt, updatedAt: last.updatedAt }) : null };
    }, 0);
  } catch (error: unknown) { throw normalizeMealError(error); }
}
export async function getOwnPersonalMeal(actor: ActorContext | null | undefined, entryId: unknown, database: PrismaClient = getPrisma()): Promise<PersonalMealDto> {
  assertPersonalMealSelf(actor);
  try {
    return await runSerializableTransaction(database, async (tx) => {
      const patientProfileId = await resolvePersonalMealOwner(actor, tx);
      const parsed = mealIdSchema.safeParse(entryId);
      if (!parsed.success) throw new NotFoundError();
      const row = await tx.personalMealEntry.findFirst({ where: { id: parsed.data, patientProfileId }, select: personalMealSelect });
      if (!row) throw new NotFoundError();
      return toPersonalMealDto(row);
    }, 0);
  } catch (error: unknown) { throw normalizeMealError(error); }
}
