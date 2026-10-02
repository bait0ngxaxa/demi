import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { PERSONAL_MEDICATION_PAGE_SIZE, type PersonalMedicationDto, type PersonalMedicationPage } from "../domain/personal-medication-definitions";
import { personalMedicationIdSchema, personalMedicationListSchema } from "../schemas/personal-medication-schemas";
import { resolvePersonalMedicationOwner } from "./personal-medication-access-service";

export const personalMedicationSelect = {
  id: true, medicationName: true, instructionText: true, status: true,
  stoppedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.PersonalMedicationSelect;
type MedicationRecord = Prisma.PersonalMedicationGetPayload<{ select: typeof personalMedicationSelect }>;

export function toPersonalMedicationDto(record: MedicationRecord): PersonalMedicationDto {
  return { ...record, stoppedAt: record.stoppedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
}

export async function listOwnPersonalMedications(
  actor: ActorContext | null | undefined, input: unknown,
  database: PrismaClient = getPrisma(),
): Promise<PersonalMedicationPage> {
  try {
    const patientProfileId = await resolvePersonalMedicationOwner(actor, database);
    const parsed = personalMedicationListSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { status, cursor } = parsed.data;
    const scope = { patientProfileId, status };
    let seek: Prisma.PersonalMedicationWhereInput = {};
    if (cursor) {
      const position = await database.personalMedication.findFirst({ where: { ...scope, id: cursor }, select: personalMedicationSelect });
      if (!position) throw new NotFoundError();
      const instant = status === "ACTIVE" ? position.createdAt : position.stoppedAt;
      if (!instant) throw new NotFoundError();
      const field = status === "ACTIVE" ? "createdAt" : "stoppedAt";
      seek = { OR: [{ [field]: { lt: instant } }, { [field]: instant, id: { lt: position.id } }] };
    }
    const rows = await database.personalMedication.findMany({
      where: { ...scope, ...seek },
      orderBy: status === "ACTIVE" ? [{ createdAt: "desc" }, { id: "desc" }] : [{ stoppedAt: "desc" }, { id: "desc" }],
      take: PERSONAL_MEDICATION_PAGE_SIZE + 1, select: personalMedicationSelect,
    });
    const items = rows.slice(0, PERSONAL_MEDICATION_PAGE_SIZE);
    return { items: items.map(toPersonalMedicationDto), nextCursor: rows.length > PERSONAL_MEDICATION_PAGE_SIZE ? items.at(-1)?.id ?? null : null };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Personal medication list could not be loaded");
  }
}

export async function getOwnPersonalMedication(
  actor: ActorContext | null | undefined, medicationId: unknown,
  database: PrismaClient = getPrisma(),
): Promise<PersonalMedicationDto> {
  try {
    const patientProfileId = await resolvePersonalMedicationOwner(actor, database);
    const parsed = personalMedicationIdSchema.safeParse(medicationId);
    if (!parsed.success) throw new NotFoundError();
    const row = await database.personalMedication.findFirst({ where: { id: parsed.data, patientProfileId }, select: personalMedicationSelect });
    if (!row) throw new NotFoundError();
    return toPersonalMedicationDto(row);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Personal medication could not be loaded");
  }
}
