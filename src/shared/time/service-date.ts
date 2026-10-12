import { z } from "zod";

/**
 * A service date is the calendar date (Asia/Bangkok) on which care was actually delivered,
 * stored as a DATE and exchanged as YYYY-MM-DD (Owner decision BR-01, BF-GAP-WB-00).
 */
const SERVICE_DATE_TIME_ZONE = "Asia/Bangkok";

const serviceDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SERVICE_DATE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isValidDateOnly(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const serviceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine(isValidDateOnly, "The service date is invalid");

/** Calendar date (YYYY-MM-DD) of an instant in Asia/Bangkok. */
export function toServiceDateOnly(instant: Date): string {
  return serviceDateFormatter.format(instant);
}

export function isServiceDateAfter(serviceDate: string, instant: Date): boolean {
  return serviceDate > toServiceDateOnly(instant);
}

export function serviceDateToUtcDate(serviceDate: string): Date {
  return new Date(`${serviceDate}T00:00:00.000Z`);
}
