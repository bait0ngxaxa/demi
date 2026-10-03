import "server-only";
import { z } from "zod";
import { MAX_CURSOR_LENGTH, isCanonicalReminderInstant, isReminderLocalDate, isReminderSourceKey, isReminderWindow, isSupportedReminderInstant } from "../domain/medication-reminder-occurrence";
import { MEDICATION_LOCAL_TIME_PATTERN } from "../domain/personal-medication-definitions";

const uuid = z.string().length(36).uuid().transform((value) => value.toLowerCase());
const instant = z.string().length(24).refine(isCanonicalReminderInstant);
const supportedInstant = instant.refine(isSupportedReminderInstant);
const sourceKey = z.string().length(53).refine(isReminderSourceKey);

export const medicationReminderOccurrenceQuerySchema = z.object({
  medicationId: uuid, from: supportedInstant, to: supportedInstant,
  cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).regex(/^[\x21-\x7e]+$/).optional(),
}).strict().refine((value) => isReminderWindow(value.from, value.to));

export const medicationReminderOccurrenceSourceSchema = z.object({
  sourceKey, sourceVersion: z.literal(1), kind: z.literal("PERSONAL_MEDICATION_DAILY"),
  personalMedicationId: uuid,
  localDate: z.string().length(10).refine(isReminderLocalDate),
  localTime: z.string().length(5).regex(MEDICATION_LOCAL_TIME_PATTERN),
  dueAt: instant, aggregateVersion: instant,
}).strict();

export const medicationReminderOccurrenceCursorSchema = z.object({
  cursorVersion: z.literal(1), sourceVersion: z.literal(1), medicationId: uuid,
  aggregateVersion: instant, from: supportedInstant, to: supportedInstant,
  evaluationAsOf: supportedInstant, lastDueAt: instant, lastSourceKey: sourceKey,
}).strict().refine((value) => isReminderWindow(value.from, value.to)
  && Date.parse(value.lastDueAt) >= Date.parse(value.from)
  && Date.parse(value.lastDueAt) < Date.parse(value.to)
  && Date.parse(value.lastDueAt) > Date.parse(value.evaluationAsOf));

export type MedicationReminderOccurrenceCursorPayload = z.infer<typeof medicationReminderOccurrenceCursorSchema>;
