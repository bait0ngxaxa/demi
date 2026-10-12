const SERVICE_DATE_TIME_ZONE = "Asia/Bangkok";

const bangkokDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SERVICE_DATE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date (YYYY-MM-DD) of an instant in Asia/Bangkok, used to bound Follow-up service dates. */
export function toServiceDateOnly(instant: Date): string {
  return bangkokDateFormatter.format(instant);
}

export function isServiceDateAfter(serviceDate: string, instant: Date): boolean {
  return serviceDate > toServiceDateOnly(instant);
}

export function serviceDateToUtcDate(serviceDate: string): Date {
  return new Date(`${serviceDate}T00:00:00.000Z`);
}
