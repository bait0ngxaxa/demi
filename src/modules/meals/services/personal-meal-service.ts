import "server-only";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { mealBangkokToday, toMealDateCarrier, type PersonalMealDto } from "../domain/personal-meal";
import { assertPersonalMealSelf } from "../policies/personal-meal-policy";
import { mealCreateSchema, mealUpdateSchema, mealDeleteSchema } from "../schemas/personal-meal-schemas";
import { resolvePersonalMealOwner } from "./personal-meal-access-service";
import { personalMealSelect, toPersonalMealDto, normalizeMealError } from "./personal-meal-query-service";

type Dependencies = { database?: PrismaClient; now?: () => Date };
export type MealMutationResult = { outcome: "CREATED" | "REPLAY" | "UPDATED" | "NOOP"; item: PersonalMealDto } | { outcome: "DELETED"; entryId: string };
function serverNow(deps: Dependencies): Date {
  const now = deps.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError();
  return new Date(now.getTime());
}
async function mutate(actor: ActorContext | null | undefined, input: unknown, operation: "create" | "update" | "delete", deps: Dependencies): Promise<MealMutationResult> {
  assertPersonalMealSelf(actor);
  try {
    const parsed = (operation === "create" ? mealCreateSchema : operation === "update" ? mealUpdateSchema : mealDeleteSchema).safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const fields = parsed.data;
    return await runSerializableTransaction(deps.database ?? getPrisma(), async (tx) => {
      const patientProfileId = await resolvePersonalMealOwner(actor, tx);
      if ("submissionNonce" in fields) {
        const receipt = await tx.personalMealCreateReceipt.findUnique({ where: { patientProfileId_submissionNonce: { patientProfileId, submissionNonce: fields.submissionNonce } }, select: { mealEntryId: true } });
        if (receipt) {
          const row = await tx.personalMealEntry.findFirst({ where: { id: receipt.mealEntryId, patientProfileId }, select: personalMealSelect });
          if (!row) throw new ConflictError();
          return { outcome: "REPLAY", item: toPersonalMealDto(row) };
        }
        const now = serverNow(deps);
        if (fields.occurredOn > mealBangkokToday(now)) throw new ValidationError();
        const row = await tx.personalMealEntry.create({ data: { patientProfileId, category: fields.category,
          occurredOn: toMealDateCarrier(fields.occurredOn), description: fields.description, createdAt: now, updatedAt: now }, select: personalMealSelect });
        await tx.personalMealCreateReceipt.create({ data: { patientProfileId, submissionNonce: fields.submissionNonce, mealEntryId: row.id, createdAt: now } });
        await recordAuditEvent({ actorUserId: actor.userId, action: "personal_meal.created", resourceType: "PersonalMealEntry", resourceId: row.id }, tx);
        return { outcome: "CREATED", item: toPersonalMealDto(row) };
      }
      const current = await tx.personalMealEntry.findFirst({ where: { id: fields.entryId, patientProfileId }, select: personalMealSelect });
      if (!current) throw new NotFoundError();
      if (current.updatedAt.getTime() !== new Date(fields.expectedUpdatedAt).getTime()) throw new ConflictError();
      const where = { id: current.id, patientProfileId, updatedAt: current.updatedAt };
      if (operation === "update") {
        const editable = mealUpdateSchema.safeParse(input);
        if (!editable.success) throw new ValidationError();
        const values = editable.data;
        const now = serverNow(deps);
        if (values.occurredOn > mealBangkokToday(now)) throw new ValidationError();
        const occurredOn = toMealDateCarrier(values.occurredOn);
        if (current.category === values.category && current.occurredOn.getTime() === occurredOn.getTime() && current.description === values.description) return { outcome: "NOOP", item: toPersonalMealDto(current) };
        const changed = await tx.personalMealEntry.updateMany({ where, data: { category: values.category, occurredOn, description: values.description,
          updatedAt: new Date(Math.max(now.getTime(), current.updatedAt.getTime() + 1)) } });
        if (changed.count !== 1) throw new ConflictError();
        await recordAuditEvent({ actorUserId: actor.userId, action: "personal_meal.updated", resourceType: "PersonalMealEntry", resourceId: current.id }, tx);
        const row = await tx.personalMealEntry.findFirst({ where: { id: current.id, patientProfileId }, select: personalMealSelect });
        if (!row) throw new InfrastructureError();
        return { outcome: "UPDATED", item: toPersonalMealDto(row) };
      }
      const changed = await tx.personalMealEntry.deleteMany({ where });
      if (changed.count !== 1) throw new ConflictError();
      await recordAuditEvent({ actorUserId: actor.userId, action: "personal_meal.deleted", resourceType: "PersonalMealEntry", resourceId: current.id }, tx);
      return { outcome: "DELETED", entryId: current.id };
    }, 0);
  } catch (error: unknown) { throw normalizeMealError(error); }
}
export async function createPersonalMeal(actor: ActorContext | null | undefined, input: unknown, deps: Dependencies = {}): Promise<MealMutationResult> { return mutate(actor, input, "create", deps); }
export async function updatePersonalMeal(actor: ActorContext | null | undefined, input: unknown, deps: Dependencies = {}): Promise<MealMutationResult> { return mutate(actor, input, "update", deps); }
export async function deletePersonalMeal(actor: ActorContext | null | undefined, input: unknown, deps: Dependencies = {}): Promise<MealMutationResult> { return mutate(actor, input, "delete", deps); }
