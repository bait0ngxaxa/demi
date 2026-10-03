import { MEDICATION_LOCAL_TIME_PATTERN } from "./personal-medication-definitions";

// Dates here are exclusively Prisma TIME carriers, never occurrences or local dates.
export function toMedicationTimeCarrier(localTime: string): Date {
  if (localTime.length !== 5 || !MEDICATION_LOCAL_TIME_PATTERN.test(localTime)) throw new Error("Invalid medication clock time");
  const hour = Number(localTime.slice(0, 2));
  const minute = Number(localTime.slice(3, 5));
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
}

export function fromMedicationTimeCarrier(carrier: Date): string {
  if (!Number.isFinite(carrier.getTime()) || carrier.getUTCSeconds() !== 0 || carrier.getUTCMilliseconds() !== 0) {
    throw new Error("Invalid medication clock time");
  }
  return `${String(carrier.getUTCHours()).padStart(2, "0")}:${String(carrier.getUTCMinutes()).padStart(2, "0")}`;
}
