import { afterEach, describe, expect, it, vi } from "vitest";

import { buildLineNotificationCard } from "@/modules/line/services/line-notification-card";

import { MEDICATION_LINE_REMINDER_TEXT, medicationLineReminderCopy } from "./medication-line-reminders";

describe("ADR-0033 medication reminder copy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps today's text byte for byte", () => {
    expect(medicationLineReminderCopy({ localTime: "08:00", medicationName: "ยาความดัน" }).text)
      .toBe("ถึงเวลาตามการแจ้งเตือนยาที่คุณตั้งไว้แล้ว กรุณาเปิด DEMI เพื่อตรวจสอบ");
    expect(medicationLineReminderCopy({ localTime: "08:00", medicationName: null }).text).toBe(MEDICATION_LINE_REMINDER_TEXT);
  });

  it("names the medication in the body only and shows only the time on the lock screen", () => {
    const { card } = medicationLineReminderCopy({ localTime: "20:30", medicationName: "Amlodipine 5 mg" });
    expect(card).toMatchObject({ title: "ยาถึงเวลาแล้ว", tone: "info", destination: "OPEN_PATIENT_MEDICATIONS", altText: "ยาถึงเวลาแล้ว: 20:30 น." });
    expect(card.fields).toEqual([{ label: "เวลา", value: "20:30 น." }, { label: "ยา", value: "Amlodipine 5 mg" }]);
    expect(card.altText).not.toContain("Amlodipine");
  });

  it("bounds a long name and omits a blank one", () => {
    expect([...(medicationLineReminderCopy({ localTime: "07:05", medicationName: "ก".repeat(200) }).card.fields[1]?.value ?? "")]).toHaveLength(120);
    expect(medicationLineReminderCopy({ localTime: "07:05", medicationName: "  " }).card.fields).toHaveLength(1);
  });

  it.each(["7:05", "24:00", "08:60", "08:00:00"])("rejects the malformed time %s", (localTime) => {
    expect(() => medicationLineReminderCopy({ localTime, medicationName: null })).toThrow(RangeError);
  });

  it("opens the Patient's medications through the Workspace LIFF", () => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID", "1234567890-WorkSpace");
    const copy = medicationLineReminderCopy({ localTime: "08:00", medicationName: "ยาความดัน" });
    const first = buildLineNotificationCard(copy.card);
    expect(first.contents.footer?.contents[0]).toMatchObject({
      action: { type: "uri", uri: "https://liff.line.me/1234567890-WorkSpace/app/personal/medications" },
    });
    // Deterministic: the same occurrence renders the same payload on every attempt.
    expect(JSON.stringify(buildLineNotificationCard(medicationLineReminderCopy({ localTime: "08:00", medicationName: "ยาความดัน" }).card)))
      .toBe(JSON.stringify(first));
  });
});
