import type { PatientServiceCode, PatientServiceRequestSlot } from "@prisma/client";

import { serviceDateToUtcDate, toServiceDateOnly } from "@/shared/time/service-date";

/** ADR-0023: the home-visit services a patient may request. */
export const PATIENT_SERVICE_LABELS: Record<PatientServiceCode, string> = {
  SCREENING: "คัดกรอง",
  FOLLOW_UP: "ติดตาม",
  EMPOWERMENT: "เสริมพลังใจ",
};

/** ADR-0023 (SR-D6): the patient's preferred slot; staff set the exact time on confirmation. */
export const PATIENT_SERVICE_REQUEST_SLOT_LABELS: Record<PatientServiceRequestSlot, string> = {
  MORNING: "เช้า",
  AFTERNOON: "บ่าย",
  ANY: "ตามสะดวก",
};

export const PATIENT_SERVICE_REQUEST_NOTE_MAX_LENGTH = 500;
export const PATIENT_SERVICE_REQUEST_REJECTION_REASON_MAX_LENGTH = 500;
export const PREFERRED_DATE_MAX_DAYS_AHEAD = 60;

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function addCalendarDays(dateOnly: string, days: number): string {
  return new Date(serviceDateToUtcDate(dateOnly).getTime() + days * DAY_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
}

/**
 * SR-D6: a preferred date (YYYY-MM-DD) runs from tomorrow to today + 60 days on the Asia/Bangkok calendar.
 * The caller validates the YYYY-MM-DD shape; ISO dates compare correctly as strings.
 */
export function isValidPreferredDate(preferredDate: string, now: Date): boolean {
  const today = toServiceDateOnly(now);

  return (
    preferredDate >= addCalendarDays(today, 1) &&
    preferredDate <= addCalendarDays(today, PREFERRED_DATE_MAX_DAYS_AHEAD)
  );
}
