// Defensive structural bound only; no clinical interpretation.
export const EXERCISE_DURATION_RAW_MAX = 20;
export const EXERCISE_DURATION_MAX = 1_000_000;
export const EXERCISE_ACTIVITY_RAW_MAX = 240;
export const EXERCISE_ACTIVITY_MAX = 120;
export const EXERCISE_NOTE_RAW_MAX = 2000;
export const EXERCISE_NOTE_MAX = 1000;
export const EXERCISE_PAGE_SIZE = 50;
export const EXERCISE_FORM_MAX_BYTES = 16 * 1024;
export const EXERCISE_CURSOR_MAX_LENGTH = 2048;
export const EXERCISE_CURSOR_MAX_BYTES = 1024;
export type PersonalExerciseDto = {
  id: string; activityName: string; occurredOn: string; durationMinutes: number | null; note: string | null;
  createdAt: string; updatedAt: string;
};
export type PersonalExercisePage = { items: PersonalExerciseDto[]; nextCursor: string | null };

// A Date here is strictly a Prisma DATE carrier, never an Exercise occurrence instant.
export function isExerciseCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith("0000")) return false;
  const carrier = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(carrier.getTime()) && carrier.toISOString().slice(0, 10) === value;
}
export function toExerciseDateCarrier(value: string): Date {
  if (!isExerciseCivilDate(value)) throw new RangeError("Invalid civil date");
  return new Date(`${value}T00:00:00.000Z`);
}
export function fromExerciseDateCarrier(value: Date): string {
  const result = value.toISOString().slice(0, 10);
  if (!isExerciseCivilDate(result)) throw new RangeError("Invalid civil date carrier");
  return result;
}
export function exerciseBangkokToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok", calendar: "gregory", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (kind: string): string => parts.find(({ type }) => type === kind)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
