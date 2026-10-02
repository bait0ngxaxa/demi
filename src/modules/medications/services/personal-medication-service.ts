import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction, isRetryableSerializableTransactionError } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ConflictError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import type { PersonalMedicationDto } from "../domain/personal-medication-definitions";
import { assertPersonalMedicationSelf } from "../policies/personal-medication-policy";
import { personalMedicationCreateSchema, personalMedicationUpdateSchema, personalMedicationStopSchema } from "../schemas/personal-medication-schemas";
import { resolvePersonalMedicationOwner } from "./personal-medication-access-service";
import { personalMedicationSelect, toPersonalMedicationDto } from "./personal-medication-query-service";

export type PersonalMedicationServiceDependencies = { database?: PrismaClient; now?: () => Date };

function serverNow(dependencies: PersonalMedicationServiceDependencies): Date {
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError();
  return new Date(now.getTime());
}

async function mutate(
  actor: ActorContext | null | undefined, input: unknown,
  operation: "created" | "updated" | "stopped",
  dependencies: PersonalMedicationServiceDependencies,
): Promise<PersonalMedicationDto> {
  assertPersonalMedicationSelf(actor);
  try {
    return await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const patientProfileId = await resolvePersonalMedicationOwner(actor, transaction);
      const schema = operation === "created" ? personalMedicationCreateSchema : operation === "updated" ? personalMedicationUpdateSchema : personalMedicationStopSchema;
      const parsed = schema.safeParse(input);
      if (!parsed.success) throw new ValidationError();
      const fields = parsed.data;
      const now = serverNow(dependencies);
      let result: PersonalMedicationDto;
      if (operation === "created" && "medicationName" in fields) {
        const row = await transaction.personalMedication.create({
          data: { patientProfileId, medicationName: fields.medicationName, instructionText: fields.instructionText,
            status: "ACTIVE", stoppedAt: null, createdAt: now, updatedAt: now },
          select: personalMedicationSelect,
        });
        result = toPersonalMedicationDto(row);
      } else if ("medicationId" in fields) {
        const current = await transaction.personalMedication.findFirst({
          where: { id: fields.medicationId, patientProfileId }, select: personalMedicationSelect,
        });
        if (!current) throw new NotFoundError();
        if (current.status !== "ACTIVE" || current.updatedAt.getTime() !== new Date(fields.expectedUpdatedAt).getTime()) throw new ConflictError();
        const updatedAt = new Date(Math.max(now.getTime(), current.updatedAt.getTime() + 1));
        let data: Prisma.PersonalMedicationUpdateManyMutationInput;
        if (operation === "stopped") {
          data = { status: "STOPPED", stoppedAt: now, updatedAt };
        } else {
          const editable = personalMedicationUpdateSchema.safeParse(input);
          if (!editable.success) throw new ValidationError();
          data = { medicationName: editable.data.medicationName, instructionText: editable.data.instructionText, updatedAt };
        }
        const changed = await transaction.personalMedication.updateMany({
          where: { id: current.id, patientProfileId, status: "ACTIVE", updatedAt: current.updatedAt }, data,
        });
        if (changed.count !== 1) throw new ConflictError();
        const row = await transaction.personalMedication.findFirst({ where: { id: current.id, patientProfileId }, select: personalMedicationSelect });
        if (!row) throw new InfrastructureError();
        result = toPersonalMedicationDto(row);
      } else {
        throw new ValidationError();
      }
      await recordAuditEvent({ actorUserId: actor.userId, action: `personal_medication.${operation}`,
        resourceType: "PersonalMedication", resourceId: result.id }, transaction);
      return result;
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    if (isRetryableSerializableTransactionError(error)) throw new ConflictError();
    throw new InfrastructureError("Personal medication could not be saved");
  }
}

export async function createPersonalMedication(actor: ActorContext | null | undefined, input: unknown, dependencies: PersonalMedicationServiceDependencies = {}): Promise<PersonalMedicationDto> {
  return mutate(actor, input, "created", dependencies);
}
export async function updatePersonalMedication(actor: ActorContext | null | undefined, input: unknown, dependencies: PersonalMedicationServiceDependencies = {}): Promise<PersonalMedicationDto> {
  return mutate(actor, input, "updated", dependencies);
}
export async function stopPersonalMedication(actor: ActorContext | null | undefined, input: unknown, dependencies: PersonalMedicationServiceDependencies = {}): Promise<PersonalMedicationDto> {
  return mutate(actor, input, "stopped", dependencies);
}
