import {
  appointmentLineNotificationCopy,
  type AppointmentLineNotificationContent,
} from "@/modules/appointments/domain/appointment-line-notifications";
import type { LineMessage } from "@/modules/line/adapters/line-messaging-client";
import { buildLineNotificationCard } from "@/modules/line/services/line-notification-card";

/**
 * ADR-0033: one synthetic sample of every Flex notification type, for
 * `npm run line:flex:validate`. No database, no real person: every value is
 * invented. Builders read the configured Workspace LIFF so LINE validates the
 * exact button URLs production would send.
 */
export type LineFlexSample = { readonly name: string; readonly build: () => LineMessage };

const SAMPLE_FACTS = {
  appointmentType: "FOLLOW_UP",
  scheduledAt: new Date("2026-11-12T02:30:00.000Z"),
  locationType: "HOME_VISIT",
  hospitalName: "รพ.สต. ตัวอย่าง",
  patientDisplayName: "ผู้ป่วย ตัวอย่าง",
} as const;

const APPOINTMENT_SAMPLES: readonly AppointmentLineNotificationContent[] = [
  ...(["CREATED", "RESCHEDULED", "CANCELLED"] as const).flatMap((eventKind) =>
    (["PATIENT", "OSM", "CAREGIVER"] as const).map((recipientKind) => ({ eventKind, recipientKind, ...SAMPLE_FACTS }))),
  { eventKind: "OSM_APPOINTMENT_ASSIGNED", ...SAMPLE_FACTS },
  { eventKind: "OSM_RESCHEDULE_REQUESTED", ...SAMPLE_FACTS },
  { eventKind: "OSM_PATIENT_ASSIGNED", hospitalName: SAMPLE_FACTS.hospitalName, patientDisplayName: SAMPLE_FACTS.patientDisplayName },
  {
    eventKind: "OSM_SERVICE_REQUESTED",
    serviceCode: "SCREENING",
    preferredDate: new Date("2026-11-20T00:00:00.000Z"),
    preferredSlot: "MORNING",
    hospitalName: SAMPLE_FACTS.hospitalName,
    patientDisplayName: SAMPLE_FACTS.patientDisplayName,
  },
];

export const LINE_FLEX_SAMPLES: readonly LineFlexSample[] = [
  ...APPOINTMENT_SAMPLES.map((content): LineFlexSample => ({
    name: `appointment:${content.eventKind}${"recipientKind" in content ? `:${content.recipientKind}` : ""}`,
    build: () => buildLineNotificationCard(appointmentLineNotificationCopy(content).card),
  })),
];
