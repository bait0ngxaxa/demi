import { LineReachability } from "@prisma/client";

export const MEDICATION_LINE_REMINDER_TEXT = "ถึงเวลาตามการแจ้งเตือนยาที่คุณตั้งไว้แล้ว กรุณาเปิด DEMI เพื่อตรวจสอบ";
export const MEDICATION_LINE_REMINDER_BATCH_SIZE = 20;
export const MEDICATION_LINE_REMINDER_MATERIALIZE_LIMIT = 200;
export const MEDICATION_LINE_REMINDER_LEASE_MS = 30_000;
export const MEDICATION_LINE_REMINDER_MAX_ATTEMPTS = 3;
export const MEDICATION_LINE_REMINDER_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export const MEDICATION_LINE_REMINDER_TERMINAL_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export function medicationLineReminderRetryDelayMs(attemptCount: number, random: () => number = Math.random): number {
  const base = attemptCount === 1 ? 60_000 : attemptCount === 2 ? 240_000 : null;
  if (base === null) throw new RangeError("No medication reminder retry remains");
  const value = random();
  const sample = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
  return Math.floor(base * (0.9 + sample * 0.2));
}

export function isFreshMedicationReminderFriend(input: { reachability: LineReachability; observedAt: Date | null; now: Date }): boolean {
  if (input.reachability !== LineReachability.FRIEND || !input.observedAt) return false;
  const age = input.now.getTime() - input.observedAt.getTime();
  return age >= 0 && age <= 30 * 24 * 60 * 60 * 1000;
}
