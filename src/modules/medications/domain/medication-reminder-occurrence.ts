import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";
import { MEDICATION_LOCAL_TIME_PATTERN, MEDICATION_SCHEDULE_MAX_TIMES } from "./personal-medication-definitions";

export const MAX_WINDOW_DAYS = 7;
export const MAX_WINDOW_MS = 604_800_000;
export const PAGE_SIZE = 100;
export const LOOKAHEAD = 101;
export const MAX_LOCAL_DATES = 8;
export const MAX_SCHEDULES = MEDICATION_SCHEDULE_MAX_TIMES;
export const MAX_CANDIDATE_TUPLES = 11_520;
export const MAX_CURSOR_LENGTH = 1_024;
export const MAX_CURSOR_JSON_BYTES = 512;
const BANGKOK_OFFSET_MS = 25_200_000;
const DAY_MS = 86_400_000;
const uuidSchema = z.string().length(36).uuid().transform((value) => value.toLowerCase());

export type MedicationReminderOccurrenceSource = {
  sourceKey: string;
  sourceVersion: 1;
  kind: "PERSONAL_MEDICATION_DAILY";
  personalMedicationId: string;
  localDate: string;
  localTime: string;
  dueAt: string;
  aggregateVersion: string;
};
export type MedicationReminderOccurrencePage = {
  items: MedicationReminderOccurrenceSource[];
  nextCursor: string | null;
  evaluationAsOf: string;
  aggregateVersion: string;
};
export type MedicationReminderOccurrenceRevalidation = { status: "CURRENT"; aggregateVersion: string } | { status: "STALE" };
export type ReminderSchedule = { id: string; localTime: string };
export type ReminderCandidate = { sourceKey: string; localDate: string; localTime: string; dueAt: string };

export function canonicalReminderUuid(value: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError();
  return parsed.data;
}

function isGregorianDate(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value < "0001-01-01") return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function isReminderLocalDate(value: string): boolean {
  return value.length === 10 && value >= "1970-01-01" && value <= "9999-12-31" && isGregorianDate(value);
}

export function isCanonicalReminderInstant(value: string): boolean {
  if (value.length !== 24 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/.test(value) || !isGregorianDate(value.slice(0, 10))) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

export function isSupportedReminderInstant(value: string): boolean {
  return isCanonicalReminderInstant(value) && value >= "1970-01-01T00:00:00.000Z" && value <= "9999-12-31T16:59:59.999Z";
}

export function isReminderWindow(from: string, to: string): boolean {
  if (!isSupportedReminderInstant(from) || !isSupportedReminderInstant(to)) return false;
  const duration = Date.parse(to) - Date.parse(from);
  return duration > 0 && duration <= MAX_WINDOW_MS;
}

export function isCanonicalReminderBase64url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, "base64url").toString("base64url") === value;
}

export function isReminderSourceKey(value: string): boolean {
  if (value.length !== 53 || !value.startsWith("medsrc_v1_")) return false;
  const digest = value.slice(10);
  return isCanonicalReminderBase64url(digest) && Buffer.from(digest, "base64url").length === 32;
}

export function createReminderSourceKey(scheduleId: string, localDate: string): string {
  const id = canonicalReminderUuid(scheduleId);
  if (!isReminderLocalDate(localDate)) throw new ValidationError();
  try {
    return `medsrc_v1_${createHash("sha256").update(`demi.personal-medication-reminder-source.v1\u0000${id}\u0000${localDate}`, "utf8").digest("base64url")}`;
  } catch { throw new InfrastructureError(); }
}

// Independently testable guard; no hash override or secret participates in source identity.
export function guardReminderTuple(tuples: Map<string, string>, sourceKey: string, canonicalTuple: string): void {
  if (tuples.has(sourceKey)) throw new InfrastructureError();
  tuples.set(sourceKey, canonicalTuple);
}

function bangkokFormatter(): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone: "Asia/Bangkok", calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { throw new InfrastructureError(); }
}

function verifyBangkok(formatter: Intl.DateTimeFormat, epoch: number, localCarrier: string): void {
  try {
    const parts = new Map(formatter.formatToParts(new Date(epoch)).map((part) => [part.type, part.value]));
    const date = `${parts.get("year")?.padStart(4, "0")}-${parts.get("month")}-${parts.get("day")}`;
    if (date !== localCarrier.slice(0, 10) || parts.get("hour") !== localCarrier.slice(11, 13) || parts.get("minute") !== localCarrier.slice(14, 16) || parts.get("second") !== localCarrier.slice(17, 19)) throw new InfrastructureError();
  } catch { throw new InfrastructureError(); }
}

export function reminderBangkokToUtc(localDate: string, localTime: string, formatter = bangkokFormatter()): string {
  if (!isReminderLocalDate(localDate) || localTime.length !== 5 || !MEDICATION_LOCAL_TIME_PATTERN.test(localTime)) throw new ValidationError();
  const carrier = `${localDate}T${localTime}:00.000Z`;
  if (!isCanonicalReminderInstant(carrier)) throw new InfrastructureError();
  const epoch = Date.parse(carrier) - BANGKOK_OFFSET_MS;
  verifyBangkok(formatter, epoch, carrier);
  return new Date(epoch).toISOString();
}

export function reminderWindowDates(from: string, to: string): string[] {
  if (!isReminderWindow(from, to)) throw new ValidationError();
  const formatter = bangkokFormatter();
  const endpoints = [Date.parse(from), Date.parse(to) - 1].map((epoch) => {
    const carrier = new Date(epoch + BANGKOK_OFFSET_MS).toISOString();
    verifyBangkok(formatter, epoch, carrier);
    return carrier.slice(0, 10);
  });
  const dates: string[] = [];
  for (let epoch = Date.parse(`${endpoints[0]}T00:00:00.000Z`); epoch <= Date.parse(`${endpoints[1]}T00:00:00.000Z`); epoch += DAY_MS) {
    if (dates.length >= MAX_LOCAL_DATES) throw new InfrastructureError();
    dates.push(new Date(epoch).toISOString().slice(0, 10));
  }
  return dates;
}

export function deriveReminderCandidates(schedules: readonly ReminderSchedule[], dates: readonly string[], window?: { from: string; to: string; evaluationAsOf: string }): ReminderCandidate[] {
  if (schedules.length > MAX_SCHEDULES || dates.length > MAX_LOCAL_DATES || schedules.length * dates.length > MAX_CANDIDATE_TUPLES || new Set(dates).size !== dates.length) throw new InfrastructureError();
  const ids = new Set<string>();
  const times = new Set<string>();
  const normalized = schedules.map((schedule) => {
    const parsed = uuidSchema.safeParse(schedule.id);
    if (!parsed.success || schedule.localTime.length !== 5 || !MEDICATION_LOCAL_TIME_PATTERN.test(schedule.localTime) || ids.has(parsed.data) || times.has(schedule.localTime)) throw new InfrastructureError();
    ids.add(parsed.data); times.add(schedule.localTime);
    return { id: parsed.data, localTime: schedule.localTime };
  });
  if (dates.some((date) => !isReminderLocalDate(date))) throw new InfrastructureError();
  if (window && (!isReminderWindow(window.from, window.to) || !isSupportedReminderInstant(window.evaluationAsOf))) throw new ValidationError();
  const formatter = bangkokFormatter();
  const tuples = new Map<string, string>();
  const candidates: ReminderCandidate[] = [];
  for (const localDate of dates) for (const schedule of normalized) {
    const dueAt = reminderBangkokToUtc(localDate, schedule.localTime, formatter);
    const epoch = Date.parse(dueAt);
    if (window && (epoch < Date.parse(window.from) || epoch >= Date.parse(window.to) || epoch <= Date.parse(window.evaluationAsOf))) continue;
    const sourceKey = createReminderSourceKey(schedule.id, localDate);
    guardReminderTuple(tuples, sourceKey, `${schedule.id}\u0000${localDate}`);
    candidates.push({ sourceKey, localDate, localTime: schedule.localTime, dueAt });
  }
  return candidates.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || (a.sourceKey < b.sourceKey ? -1 : a.sourceKey > b.sourceKey ? 1 : 0));
}
