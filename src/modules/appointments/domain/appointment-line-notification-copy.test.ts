import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notificationCard } from "@/modules/line/presentation/flex/notification-card";
import { buildLineNotificationCard } from "@/modules/line/services/line-notification-card";

import {
  appointmentLineNotificationCopy,
  appointmentLineNotificationText,
  appointmentPatientDisplayName,
  OSM_APPOINTMENT_ASSIGNED_LINE_NOTIFICATION_TEXT,
  OSM_PATIENT_ASSIGNED_LINE_NOTIFICATION_TEXT,
  OSM_RESCHEDULE_REQUESTED_LINE_NOTIFICATION_TEXT,
  patientServiceRequestLineNotificationText,
  type AppointmentLineNotificationContent,
} from "./appointment-line-notifications";

const PATIENT_NAME = "สมหญิง ใจดี";
// 2026-11-12 09:30 Asia/Bangkok.
const SCHEDULED_AT = new Date("2026-11-12T02:30:00.000Z");
const FACTS = {
  appointmentType: "FOLLOW_UP",
  scheduledAt: SCHEDULED_AT,
  locationType: "HOME_VISIT",
  hospitalName: "รพ.สต. บ้านทดสอบ",
  patientDisplayName: PATIENT_NAME,
} as const;

const EVERY_CONTENT: readonly AppointmentLineNotificationContent[] = [
  ...(["CREATED", "RESCHEDULED", "CANCELLED"] as const).flatMap((eventKind) =>
    (["PATIENT", "OSM", "CAREGIVER"] as const).map((matchedRecipient) => ({ eventKind, matchedRecipient, ...FACTS }))),
  { eventKind: "OSM_APPOINTMENT_ASSIGNED", ...FACTS },
  { eventKind: "OSM_RESCHEDULE_REQUESTED", ...FACTS },
  { eventKind: "OSM_PATIENT_ASSIGNED", hospitalName: FACTS.hospitalName, patientDisplayName: PATIENT_NAME },
  {
    eventKind: "OSM_SERVICE_REQUESTED",
    serviceCode: "SCREENING",
    preferredDate: new Date("2026-11-20T00:00:00.000Z"),
    preferredSlot: "MORNING",
    hospitalName: FACTS.hospitalName,
    patientDisplayName: PATIENT_NAME,
    recipientIsAssignedOsm: true,
  },
  {
    eventKind: "OSM_SERVICE_REQUESTED",
    serviceCode: "SCREENING",
    preferredDate: new Date("2026-11-20T00:00:00.000Z"),
    preferredSlot: "MORNING",
    hospitalName: FACTS.hospitalName,
    patientDisplayName: PATIENT_NAME,
    recipientIsAssignedOsm: false,
  },
];

function label(content: AppointmentLineNotificationContent): string {
  if ("matchedRecipient" in content) return `${content.eventKind}/${content.matchedRecipient}`;
  if (content.eventKind === "OSM_SERVICE_REQUESTED") return `${content.eventKind}/${content.recipientIsAssignedOsm ? "assigned" : "preferred"}`;
  return content.eventKind;
}

describe("ADR-0033 appointment notification copy", () => {
  it.each(EVERY_CONTENT.map((content) => [label(content), content] as const))("%s obeys the lock-screen rule", (_name, content) => {
    const { card } = appointmentLineNotificationCopy(content);
    expect(card.altText).not.toContain(PATIENT_NAME);
    expect(card.altText).not.toContain("สมหญิง");
    expect(card.altText).not.toMatch(/https?:|liff\.line\.me|:\/\//u);
    expect(card.altText).not.toContain(FACTS.hospitalName);
    expect(card.altText).not.toMatch(/\d{2}:\d{2}/u);
    // A valid card: the builder enforces every structural limit.
    expect(() => notificationCard({
      ...card,
      ...(card.actionLabel ? { action: { label: card.actionLabel, uri: "https://liff.line.me/1-x/app" } } : {}),
    })).not.toThrow();
  });

  it("keeps today's text for every family byte for byte", () => {
    const texts = Object.fromEntries(EVERY_CONTENT.map((content) => [label(content), appointmentLineNotificationCopy(content).text]));
    for (const key of ["CREATED/PATIENT", "RESCHEDULED/OSM", "CANCELLED/CAREGIVER"]) {
      expect(texts[key]).toBe("มีนัดหมายประเภท ติดตาม อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ");
      expect(texts[key]).toBe(appointmentLineNotificationText("FOLLOW_UP"));
    }
    expect(texts.OSM_PATIENT_ASSIGNED).toBe("มีผู้ป่วยที่ได้รับมอบหมายให้คุณดูแล กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ");
    expect(texts.OSM_PATIENT_ASSIGNED).toBe(OSM_PATIENT_ASSIGNED_LINE_NOTIFICATION_TEXT);
    expect(texts.OSM_APPOINTMENT_ASSIGNED).toBe("มีนัดเยี่ยมบ้านที่ได้รับมอบหมายให้คุณ กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ");
    expect(texts.OSM_APPOINTMENT_ASSIGNED).toBe(OSM_APPOINTMENT_ASSIGNED_LINE_NOTIFICATION_TEXT);
    expect(texts.OSM_RESCHEDULE_REQUESTED).toBe("มีคำขอเลื่อนนัดรอทบทวน กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ");
    expect(texts.OSM_RESCHEDULE_REQUESTED).toBe(OSM_RESCHEDULE_REQUESTED_LINE_NOTIFICATION_TEXT);
    expect(texts["OSM_SERVICE_REQUESTED/preferred"]).toBe(texts["OSM_SERVICE_REQUESTED/assigned"]);
    expect(texts["OSM_SERVICE_REQUESTED/assigned"]).toBe("มีคำขอรับบริการคัดกรอง วันที่ 20 พฤศจิกายน 2569 เช้า กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ");
    expect(texts["OSM_SERVICE_REQUESTED/assigned"]).toBe(patientServiceRequestLineNotificationText({
      serviceCode: "SCREENING",
      preferredDate: new Date("2026-11-20T00:00:00.000Z"),
      preferredSlot: "MORNING",
    }));
    for (const content of EVERY_CONTENT) expect(appointmentLineNotificationCopy(content).text).not.toContain(PATIENT_NAME);
  });

  it.each([
    ["CREATED", "นัดหมายใหม่", "info"],
    ["RESCHEDULED", "เลื่อนนัดหมาย", "warning"],
    ["CANCELLED", "ยกเลิกนัดหมาย", "danger"],
  ] as const)("titles %s as %s with the %s tone and shows Thai Bangkok date and time", (eventKind, title, tone) => {
    const { card } = appointmentLineNotificationCopy({ eventKind, matchedRecipient: "OSM", ...FACTS });
    expect(card).toMatchObject({ title, tone, destination: "OPEN_WORK_APPOINTMENTS" });
    expect(card.altText).toBe(`${title}: ติดตาม 12 พ.ย. 2569`);
    expect(card.fields).toEqual([
      { label: "ประเภท", value: "ติดตาม" },
      { label: "วันเวลา", value: "12 พ.ย. 2569 เวลา 09:30 น." },
      { label: "สถานที่", value: "เยี่ยมบ้าน" },
      { label: "หน่วยบริการ", value: "รพ.สต. บ้านทดสอบ" },
      { label: "ผู้ป่วย", value: PATIENT_NAME },
    ]);
  });

  it("never shows the Patient their own name and opens their appointments", () => {
    const { card } = appointmentLineNotificationCopy({ eventKind: "CREATED", matchedRecipient: "PATIENT", ...FACTS });
    expect(card.fields.map(({ label: fieldLabel }) => fieldLabel)).not.toContain("ผู้ป่วย");
    expect(JSON.stringify(card)).not.toContain(PATIENT_NAME);
    expect(card).toMatchObject({ destination: "OPEN_PATIENT_APPOINTMENTS", actionLabel: "ดูนัดหมาย" });
  });

  it("sends caregivers to the family page with only fields every grant contract shows", () => {
    const { card } = appointmentLineNotificationCopy({ eventKind: "RESCHEDULED", matchedRecipient: "CAREGIVER", ...FACTS });
    expect(card.destination).toBe("OPEN_FAMILY");
    expect(card.fields.map(({ label: fieldLabel }) => fieldLabel)).toEqual(["ประเภท", "วันเวลา", "สถานที่", "หน่วยบริการ", "ผู้ป่วย"]);
  });

  it.each([
    ["OSM_APPOINTMENT_ASSIGNED", "ได้รับมอบหมายนัดหมาย", "info", "OPEN_WORK_APPOINTMENTS"],
    ["OSM_RESCHEDULE_REQUESTED", "มีคำขอเลื่อนนัด", "warning", "OPEN_WORK_APPOINTMENTS"],
  ] as const)("titles %s and links the work appointment list", (eventKind, title, tone, destination) => {
    const { card } = appointmentLineNotificationCopy({ eventKind, ...FACTS });
    expect(card).toMatchObject({ title, tone, destination });
    expect(card.fields.find(({ label: fieldLabel }) => fieldLabel === "ผู้ป่วย")?.value).toBe(PATIENT_NAME);
  });

  it("shows a patient assignment without appointment detail and links the assigned list", () => {
    const { card } = appointmentLineNotificationCopy(EVERY_CONTENT.find(({ eventKind }) => eventKind === "OSM_PATIENT_ASSIGNED") ?? EVERY_CONTENT[0]);
    expect(card).toMatchObject({ title: "ได้รับมอบหมายผู้ป่วย", tone: "info", destination: "OPEN_OSM_ASSIGNED_PATIENTS", altText: "ได้รับมอบหมายผู้ป่วย" });
  });

  it("keeps a service request's calendar date without a time-zone shift, with its slot", () => {
    const { card } = appointmentLineNotificationCopy({
      eventKind: "OSM_SERVICE_REQUESTED",
      serviceCode: "FOLLOW_UP",
      // Stored as a calendar DATE: midnight UTC; Asia/Bangkok formatting would still say the 20th, UTC-12 would not.
      preferredDate: new Date("2026-11-20T00:00:00.000Z"),
      preferredSlot: "AFTERNOON",
      hospitalName: FACTS.hospitalName,
      patientDisplayName: null,
      recipientIsAssignedOsm: false,
    });
    expect(card).toMatchObject({ title: "มีคำขอรับบริการ", tone: "warning", altText: "มีคำขอรับบริการ: ติดตาม 20 พ.ย. 2569" });
    expect(card.fields).toEqual([
      { label: "บริการ", value: "ติดตาม" },
      { label: "วันที่สะดวก", value: "20 พ.ย. 2569 (บ่าย)" },
      { label: "สถานที่", value: "เยี่ยมบ้าน" },
      { label: "หน่วยบริการ", value: "รพ.สต. บ้านทดสอบ" },
    ]);
  });

  it("F2: gives the assigned อสม. a button to their assigned Patients, with the Patient's name", () => {
    const content = EVERY_CONTENT.find((item) => label(item) === "OSM_SERVICE_REQUESTED/assigned") ?? EVERY_CONTENT[0];
    const { card } = appointmentLineNotificationCopy(content);
    expect(card).toMatchObject({ destination: "OPEN_OSM_ASSIGNED_PATIENTS", actionLabel: "ดูผู้ป่วยที่ดูแล", note: "โรงพยาบาลจะยืนยันวันเวลานัดอีกครั้ง" });
    expect(card.fields.find(({ label: fieldLabel }) => fieldLabel === "ผู้ป่วย")?.value).toBe(PATIENT_NAME);
  });

  it("F2: gives a preferred อสม. no button and no Patient name, even if one is passed", () => {
    const content = EVERY_CONTENT.find((item) => label(item) === "OSM_SERVICE_REQUESTED/preferred") ?? EVERY_CONTENT[0];
    const { card, text } = appointmentLineNotificationCopy(content);
    expect(card.destination).toBeUndefined();
    expect(card.actionLabel).toBeUndefined();
    expect(card.note).toBe("โรงพยาบาลจะยืนยันวันเวลานัดอีกครั้ง");
    expect(JSON.stringify(card)).not.toContain(PATIENT_NAME);
    expect(text).toBe(appointmentLineNotificationCopy({ ...content, recipientIsAssignedOsm: true } as AppointmentLineNotificationContent).text);
  });

  it("omits a service request date that the Patient did not give", () => {
    const { card } = appointmentLineNotificationCopy({
      eventKind: "OSM_SERVICE_REQUESTED", serviceCode: "EMPOWERMENT", preferredDate: null, preferredSlot: null,
      hospitalName: FACTS.hospitalName, patientDisplayName: null, recipientIsAssignedOsm: false,
    });
    expect(card.altText).toBe("มีคำขอรับบริการ: เสริมพลังใจ");
    expect(card.fields.map(({ label: fieldLabel }) => fieldLabel)).toEqual(["บริการ", "สถานที่", "หน่วยบริการ"]);
  });

  it("bounds a long Patient name to the card field limit", () => {
    const { card } = appointmentLineNotificationCopy({ eventKind: "CREATED", matchedRecipient: "OSM", ...FACTS, patientDisplayName: "ก".repeat(300) });
    expect([...(card.fields.at(-1)?.value ?? "")].length).toBe(120);
  });

  it("composes display names without blanks", () => {
    expect(appointmentPatientDisplayName({ givenName: " สมหญิง ", familyName: "ใจดี" })).toBe("สมหญิง ใจดี");
    expect(appointmentPatientDisplayName({ givenName: null, familyName: " " })).toBeNull();
  });
});

describe("ADR-0033 notification card destinations", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["PATIENT", "https://liff.line.me/1234567890-WorkSpace/app/personal/appointments"],
    ["OSM", "https://liff.line.me/1234567890-WorkSpace/app/appointments"],
    ["CAREGIVER", "https://liff.line.me/1234567890-WorkSpace/app/family"],
  ] as const)("opens the %s button through the Workspace LIFF", (matchedRecipient, uri) => {
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID", "1234567890-WorkSpace");
    const message = buildLineNotificationCard(appointmentLineNotificationCopy({ eventKind: "CREATED", matchedRecipient, ...FACTS }).card);
    expect(message.contents.footer?.contents[0]).toMatchObject({ type: "button", action: { type: "uri", uri } });
  });

  it("F2: builds the preferred อสม.'s service request card without a footer", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID", "1234567890-WorkSpace");
    const content = EVERY_CONTENT.find((item) => label(item) === "OSM_SERVICE_REQUESTED/preferred") ?? EVERY_CONTENT[0];
    expect(buildLineNotificationCard(appointmentLineNotificationCopy(content).card).contents.footer).toBeUndefined();
    const assigned = EVERY_CONTENT.find((item) => label(item) === "OSM_SERVICE_REQUESTED/assigned") ?? EVERY_CONTENT[0];
    expect(buildLineNotificationCard(appointmentLineNotificationCopy(assigned).card).contents.footer?.contents[0]).toMatchObject({
      action: { type: "uri", uri: "https://liff.line.me/1234567890-WorkSpace/app/patients/assigned" },
    });
  });

  it("refuses to build a card without the Workspace LIFF instead of linking the ordinary web", () => {
    expect(() => buildLineNotificationCard(appointmentLineNotificationCopy({ eventKind: "CREATED", matchedRecipient: "PATIENT", ...FACTS }).card))
      .toThrowError(expect.objectContaining({ code: "LINE_CONFIGURATION_MISSING" }));
  });
});
