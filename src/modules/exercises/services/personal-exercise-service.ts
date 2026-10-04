import "server-only";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { exerciseBangkokToday, toExerciseDateCarrier, type PersonalExerciseDto } from "../domain/personal-exercise";
import { ExerciseCreateConsumedError } from "../domain/exercise-create-consumed-error";
import { assertPersonalExerciseSelf } from "../policies/personal-exercise-policy";
import { exerciseCreateSchema, exerciseUpdateSchema, exerciseDeleteSchema } from "../schemas/personal-exercise-schemas";
import { resolvePersonalExerciseOwner } from "./personal-exercise-access-service";
import { personalExerciseSelect, toPersonalExerciseDto, normalizeExerciseError } from "./personal-exercise-query-service";

type Dependencies = { database?: PrismaClient; now?: () => Date };
export type ExerciseMutationResult = { outcome: "CREATED" | "REPLAY" | "UPDATED" | "NOOP"; item: PersonalExerciseDto } | { outcome: "DELETED"; entryId: string };
function serverNow(deps: Dependencies): Date {
  const now = deps.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError();
  return new Date(now.getTime());
}
async function mutate(actor: ActorContext | null | undefined, input: unknown, operation: "create" | "update" | "delete", deps: Dependencies): Promise<ExerciseMutationResult> {
  assertPersonalExerciseSelf(actor);
  try {
    const parsed = (operation === "create" ? exerciseCreateSchema : operation === "update" ? exerciseUpdateSchema : exerciseDeleteSchema).safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const fields = parsed.data;
    return await runSerializableTransaction(deps.database ?? getPrisma(), async (tx) => {
      const patientProfileId = await resolvePersonalExerciseOwner(actor, tx);
      if ("submissionNonce" in fields) {
        const receipt = await tx.personalExerciseCreateReceipt.findUnique({ where: { patientProfileId_submissionNonce: { patientProfileId, submissionNonce: fields.submissionNonce } }, select: { exerciseEntryId: true } });
        if (receipt) {
          const row = await tx.personalExerciseEntry.findFirst({ where: { id: receipt.exerciseEntryId, patientProfileId }, select: personalExerciseSelect });
          if (!row) throw new ExerciseCreateConsumedError();
          return { outcome: "REPLAY", item: toPersonalExerciseDto(row) };
        }
        const now = serverNow(deps);
        if (fields.occurredOn > exerciseBangkokToday(now)) throw new ValidationError();
        const row = await tx.personalExerciseEntry.create({ data: { patientProfileId, activityName: fields.activityName, durationMinutes: fields.durationMinutes,
          occurredOn: toExerciseDateCarrier(fields.occurredOn), note: fields.note, createdAt: now, updatedAt: now }, select: personalExerciseSelect });
        await tx.personalExerciseCreateReceipt.create({ data: { patientProfileId, submissionNonce: fields.submissionNonce, exerciseEntryId: row.id, createdAt: now } });
        await recordAuditEvent({ actorUserId: actor.userId, action: "personal_exercise.created", resourceType: "PersonalExerciseEntry", resourceId: row.id }, tx);
        return { outcome: "CREATED", item: toPersonalExerciseDto(row) };
      }
      const current = await tx.personalExerciseEntry.findFirst({ where: { id: fields.entryId, patientProfileId }, select: personalExerciseSelect });
      if (!current) throw new NotFoundError();
      if (current.updatedAt.getTime() !== new Date(fields.expectedUpdatedAt).getTime()) throw new ConflictError();
      const where = { id: current.id, patientProfileId, updatedAt: current.updatedAt };
      if (operation === "update") {
        const editable = exerciseUpdateSchema.safeParse(input);
        if (!editable.success) throw new ValidationError();
        const values = editable.data;
        const now = serverNow(deps);
        if (values.occurredOn > exerciseBangkokToday(now)) throw new ValidationError();
        const occurredOn = toExerciseDateCarrier(values.occurredOn);
        if (current.activityName === values.activityName && current.durationMinutes === values.durationMinutes && current.occurredOn.getTime() === occurredOn.getTime() && current.note === values.note) return { outcome: "NOOP", item: toPersonalExerciseDto(current) };
        const changed = await tx.personalExerciseEntry.updateMany({ where, data: { activityName: values.activityName, durationMinutes: values.durationMinutes, occurredOn, note: values.note,
          updatedAt: new Date(Math.max(now.getTime(), current.updatedAt.getTime() + 1)) } });
        if (changed.count !== 1) throw new ConflictError();
        await recordAuditEvent({ actorUserId: actor.userId, action: "personal_exercise.updated", resourceType: "PersonalExerciseEntry", resourceId: current.id }, tx);
        const row = await tx.personalExerciseEntry.findFirst({ where: { id: current.id, patientProfileId }, select: personalExerciseSelect });
        if (!row) throw new InfrastructureError();
        return { outcome: "UPDATED", item: toPersonalExerciseDto(row) };
      }
      const changed = await tx.personalExerciseEntry.deleteMany({ where });
      if (changed.count !== 1) throw new ConflictError();
      await recordAuditEvent({ actorUserId: actor.userId, action: "personal_exercise.deleted", resourceType: "PersonalExerciseEntry", resourceId: current.id }, tx);
      return { outcome: "DELETED", entryId: current.id };
    }, 0);
  } catch (error: unknown) { throw normalizeExerciseError(error); }
}
export async function createPersonalExercise(actor: ActorContext | null | undefined, input: unknown, deps: Dependencies = {}): Promise<ExerciseMutationResult> { return mutate(actor, input, "create", deps); }
export async function updatePersonalExercise(actor: ActorContext | null | undefined, input: unknown, deps: Dependencies = {}): Promise<ExerciseMutationResult> { return mutate(actor, input, "update", deps); }
export async function deletePersonalExercise(actor: ActorContext | null | undefined, input: unknown, deps: Dependencies = {}): Promise<ExerciseMutationResult> { return mutate(actor, input, "delete", deps); }
