import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { isRetryableSerializableTransactionError, runSerializableTransaction } from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ConflictError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { LOOKAHEAD, MAX_SCHEDULES, PAGE_SIZE, canonicalReminderUuid, deriveReminderCandidates, isCanonicalReminderInstant, isSupportedReminderInstant, reminderWindowDates, type MedicationReminderOccurrencePage, type MedicationReminderOccurrenceRevalidation, type MedicationReminderOccurrenceSource, type ReminderSchedule } from "../domain/medication-reminder-occurrence";
import { fromMedicationTimeCarrier } from "../domain/medication-local-time";
import { assertPersonalMedicationSelf } from "../policies/personal-medication-policy";
import { medicationReminderOccurrenceQuerySchema, medicationReminderOccurrenceSourceSchema } from "../schemas/medication-reminder-occurrence-schemas";
import { resolvePersonalMedicationOwner } from "./personal-medication-access-service";
import { decodeMedicationReminderOccurrenceCursor, encodeMedicationReminderOccurrenceCursor } from "./medication-reminder-occurrence-cursor";

export type MedicationReminderOccurrenceDependencies = { database?: PrismaClient; now?: () => Date };

const reminderSelect = {
  id: true, status: true, updatedAt: true,
  schedules: { select: { id: true, localTime: true }, orderBy: [{ localTime: "asc" }, { id: "asc" }], take: MAX_SCHEDULES + 1 },
} satisfies Prisma.PersonalMedicationSelect;
type ReminderRecord = Prisma.PersonalMedicationGetPayload<{ select: typeof reminderSelect }>;

function version(row: ReminderRecord): string {
  const result = row.updatedAt.toISOString();
  if (!isCanonicalReminderInstant(result)) throw new InfrastructureError();
  return result;
}

function schedules(row: ReminderRecord): ReminderSchedule[] {
  if (row.schedules.length > MAX_SCHEDULES) throw new InfrastructureError();
  return row.schedules.map((schedule) => ({ id: schedule.id, localTime: fromMedicationTimeCarrier(schedule.localTime) }));
}

async function ownRecord(actor: ActorContext, medicationId: string, transaction: Prisma.TransactionClient): Promise<ReminderRecord> {
  const patientProfileId = await resolvePersonalMedicationOwner(actor, transaction);
  const row = await transaction.personalMedication.findFirst({ where: { id: medicationId, patientProfileId }, select: reminderSelect });
  if (!row) throw new NotFoundError();
  if (row.status !== "ACTIVE" && row.status !== "STOPPED") throw new InfrastructureError();
  if (row.schedules.length > MAX_SCHEDULES) throw new InfrastructureError();
  return row;
}

function readError(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  if (isRetryableSerializableTransactionError(error)) throw new ConflictError();
  throw new InfrastructureError("Personal medication reminder source could not be loaded");
}

export async function listOwnPersonalMedicationReminderOccurrences(
  actor: ActorContext | null | undefined, input: unknown,
  dependencies: MedicationReminderOccurrenceDependencies = {},
): Promise<MedicationReminderOccurrencePage> {
  assertPersonalMedicationSelf(actor);
  try {
    const parsed = medicationReminderOccurrenceQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { medicationId, from, to, cursor } = parsed.data;
    // Freeze once outside the helper's retry loop. Continuation never calls the clock.
    let firstAsOf: string | undefined;
    if (!cursor) {
      const clock = (dependencies.now ?? (() => new Date()))();
      if (!(clock instanceof Date) || !Number.isFinite(clock.getTime())) throw new InfrastructureError();
      firstAsOf = new Date(clock.getTime()).toISOString();
      if (!isSupportedReminderInstant(firstAsOf)) throw new InfrastructureError();
    }
    return await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const row = await ownRecord(actor, medicationId, transaction);
      const aggregateVersion = version(row);
      const continuation = cursor ? decodeMedicationReminderOccurrenceCursor(actor, cursor) : undefined;
      if (continuation && (continuation.medicationId !== medicationId || continuation.from !== from || continuation.to !== to || row.status !== "ACTIVE" || continuation.aggregateVersion !== aggregateVersion)) throw new ConflictError();
      const evaluationAsOf = continuation?.evaluationAsOf ?? firstAsOf;
      if (!evaluationAsOf) throw new InfrastructureError();
      if (row.status === "STOPPED" || (!continuation && row.schedules.length === 0)) return { items: [], nextCursor: null, evaluationAsOf, aggregateVersion };
      const candidates = deriveReminderCandidates(schedules(row), reminderWindowDates(from, to), { from, to, evaluationAsOf });
      let start = 0;
      if (continuation) {
        const anchor = candidates.findIndex((item) => item.dueAt === continuation.lastDueAt && item.sourceKey === continuation.lastSourceKey);
        if (anchor < 0) throw new ConflictError();
        start = anchor + 1;
      }
      const lookahead = candidates.slice(start, start + LOOKAHEAD);
      const items: MedicationReminderOccurrenceSource[] = lookahead.slice(0, PAGE_SIZE).map((item) => ({
        sourceKey: item.sourceKey, sourceVersion: 1, kind: "PERSONAL_MEDICATION_DAILY",
        personalMedicationId: canonicalReminderUuid(row.id), localDate: item.localDate,
        localTime: item.localTime, dueAt: item.dueAt, aggregateVersion,
      }));
      const last = items.at(-1);
      const nextCursor = lookahead.length === LOOKAHEAD && last ? encodeMedicationReminderOccurrenceCursor(actor, {
        cursorVersion: 1, sourceVersion: 1, medicationId, aggregateVersion, from, to,
        evaluationAsOf, lastDueAt: last.dueAt, lastSourceKey: last.sourceKey,
      }) : null;
      return { items, nextCursor, evaluationAsOf, aggregateVersion };
    });
  } catch (error: unknown) { readError(error); }
}

export async function revalidateOwnPersonalMedicationReminderOccurrence(
  actor: ActorContext | null | undefined, knownSource: unknown,
  dependencies: MedicationReminderOccurrenceDependencies = {},
): Promise<MedicationReminderOccurrenceRevalidation> {
  assertPersonalMedicationSelf(actor);
  try {
    const parsed = medicationReminderOccurrenceSourceSchema.safeParse(knownSource);
    if (!parsed.success) throw new ValidationError();
    const known = parsed.data;
    return await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const row = await ownRecord(actor, known.personalMedicationId, transaction);
      if (row.status === "STOPPED" || row.schedules.length === 0) return { status: "STALE" };
      const candidates = deriveReminderCandidates(schedules(row), [known.localDate]);
      const current = candidates.find((candidate) => candidate.sourceKey === known.sourceKey);
      if (!current || current.localDate !== known.localDate || current.localTime !== known.localTime || current.dueAt !== known.dueAt) return { status: "STALE" };
      return { status: "CURRENT", aggregateVersion: version(row) };
    });
  } catch (error: unknown) { readError(error); }
}
