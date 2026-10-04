import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction, isRetryableSerializableTransactionError } from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ConflictError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { fromExerciseDateCarrier, toExerciseDateCarrier, EXERCISE_PAGE_SIZE, type PersonalExerciseDto, type PersonalExercisePage } from "../domain/personal-exercise";
import { exerciseIdSchema, exerciseListSchema } from "../schemas/personal-exercise-schemas";
import { assertPersonalExerciseSelf } from "../policies/personal-exercise-policy";
import { resolvePersonalExerciseOwner } from "./personal-exercise-access-service";
import { decodeExerciseCursor, encodeExerciseCursor } from "./personal-exercise-cursor";

export const personalExerciseSelect = { id: true, activityName: true, durationMinutes: true, occurredOn: true, note: true, createdAt: true, updatedAt: true } satisfies Prisma.PersonalExerciseEntrySelect;
export function toPersonalExerciseDto(row: Prisma.PersonalExerciseEntryGetPayload<{ select: typeof personalExerciseSelect }>): PersonalExerciseDto {
  return { id: row.id, activityName: row.activityName, durationMinutes: row.durationMinutes, occurredOn: fromExerciseDateCarrier(row.occurredOn), note: row.note,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
export function normalizeExerciseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  if (isRetryableSerializableTransactionError(error)) return new ConflictError();
  return new InfrastructureError();
}
export async function listOwnPersonalExercises(actor: ActorContext | null | undefined, input: unknown, database: PrismaClient = getPrisma()): Promise<PersonalExercisePage> {
  assertPersonalExerciseSelf(actor);
  try {
    const parsed = exerciseListSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    return await runSerializableTransaction(database, async (tx) => {
      const patientProfileId = await resolvePersonalExerciseOwner(actor, tx);
      let seek: Prisma.PersonalExerciseEntryWhereInput = {};
      if (parsed.data.cursor) {
        const position = decodeExerciseCursor(actor, patientProfileId, parsed.data.cursor);
        const anchor = await tx.personalExerciseEntry.findFirst({ where: { id: position.id, patientProfileId }, select: personalExerciseSelect });
        if (!anchor) throw new NotFoundError();
        const dto = toPersonalExerciseDto(anchor);
        if (dto.occurredOn !== position.occurredOn || dto.createdAt !== position.createdAt || dto.updatedAt !== position.updatedAt) throw new ConflictError();
        const occurredOn = toExerciseDateCarrier(position.occurredOn);
        const createdAt = new Date(position.createdAt);
        seek = { OR: [{ occurredOn: { lt: occurredOn } }, { occurredOn, createdAt: { lt: createdAt } }, { occurredOn, createdAt, id: { lt: position.id } }] };
      }
      const rows = await tx.personalExerciseEntry.findMany({ where: { patientProfileId, ...seek },
        orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: EXERCISE_PAGE_SIZE + 1, select: personalExerciseSelect });
      const items = rows.slice(0, EXERCISE_PAGE_SIZE).map(toPersonalExerciseDto);
      const last = items.at(-1);
      return { items, nextCursor: rows.length > EXERCISE_PAGE_SIZE && last ? encodeExerciseCursor(actor, { version: 1, patientProfileId,
        id: last.id, occurredOn: last.occurredOn, createdAt: last.createdAt, updatedAt: last.updatedAt }) : null };
    }, 0);
  } catch (error: unknown) { throw normalizeExerciseError(error); }
}
export async function getOwnPersonalExercise(actor: ActorContext | null | undefined, entryId: unknown, database: PrismaClient = getPrisma()): Promise<PersonalExerciseDto> {
  assertPersonalExerciseSelf(actor);
  try {
    return await runSerializableTransaction(database, async (tx) => {
      const patientProfileId = await resolvePersonalExerciseOwner(actor, tx);
      const parsed = exerciseIdSchema.safeParse(entryId);
      if (!parsed.success) throw new NotFoundError();
      const row = await tx.personalExerciseEntry.findFirst({ where: { id: parsed.data, patientProfileId }, select: personalExerciseSelect });
      if (!row) throw new NotFoundError();
      return toPersonalExerciseDto(row);
    }, 0);
  } catch (error: unknown) { throw normalizeExerciseError(error); }
}
