import { describe, expect, it } from "vitest";

import {
  formatLineAppointmentReply,
  LINE_APPOINTMENT_REPLY_COPY,
  type LineAppointmentReplyData,
} from "./line-appointment-reply";

const DATA: LineAppointmentReplyData = {
  scheduledAt: new Date("2026-10-15T02:00:00.000Z"),
  hospitalName: "โรงพยาบาลตัวอย่าง",
  type: "FOLLOW_UP",
  locationType: "CLINIC",
};

function textOf(data: Partial<LineAppointmentReplyData> = {}): string {
  return formatLineAppointmentReply({ ...DATA, ...data }).text;
}

describe("LINE Patient appointment reply presentation", () => {
  it("formats the approved Thai copy in Bangkok time with Buddhist year and Latin digits", () => {
    expect(formatLineAppointmentReply(DATA)).toMatchObject({
      kind: "APPOINTMENT",
      text: "นัดหมายถัดไปของคุณ\nวันที่ 15 ตุลาคม 2569 เวลา 09:00 น.\nโรงพยาบาล โรงพยาบาลตัวอย่าง",
    });
  });

  it("keeps the text unchanged by the type and location added for the card", () => {
    expect(textOf({ type: "EDUCATION", locationType: null })).toBe(textOf());
  });

  it("handles Bangkok date/year rollover and renders midnight as 00", () => {
    expect(textOf({ scheduledAt: new Date("2026-12-31T17:30:00.000Z") })).toContain("วันที่ 1 มกราคม 2570 เวลา 00:30 น.");
  });

  it("normalizes Hospital display names to one safe line", () => {
    expect(textOf({ hospitalName: " โรงพยาบาล\n  ตัวอย่าง\tกลาง\0  " })).toContain("โรงพยาบาล โรงพยาบาล ตัวอย่าง กลาง");
  });

  it.each([
    ["INELIGIBLE", LINE_APPOINTMENT_REPLY_COPY.INELIGIBLE],
    ["INFRASTRUCTURE_FAILURE", LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE],
  ] as const)("uses the exact %s copy with an explicit kind and no card", (category, copy) => {
    expect(formatLineAppointmentReply(category)).toEqual({ kind: category, text: copy });
  });

  it.each([
    ["an invalid date", { scheduledAt: new Date(Number.NaN) }],
    ["a blank Hospital name", { hospitalName: " \n\t " }],
    ["an unknown type", { type: "CONSULTATION" as never }],
    ["an unknown location", { locationType: "MOON" as never }],
  ])("is an INFRASTRUCTURE_FAILURE for %s", (_label, data) => {
    expect(formatLineAppointmentReply({ ...DATA, ...data })).toEqual({
      kind: "INFRASTRUCTURE_FAILURE",
      text: LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE,
    });
  });

  it("does not append status, identifiers, or navigation to the text", () => {
    const reply = textOf();
    expect(reply.split("\n")).toHaveLength(3);
    expect(reply).not.toMatch(/SCHEDULED|CANCELLED|appointment|relationship|patient|https?:|\/app\//iu);
  });
});

describe("ADR-0033 no-upcoming-appointment reply card", () => {
  it("keeps today's EMPTY text and carries a field-less card that opens the service request page", () => {
    expect(formatLineAppointmentReply("EMPTY")).toEqual({
      kind: "EMPTY",
      text: "ไม่พบนัดหมายที่กำลังจะมาถึง",
      card: {
        tone: "info",
        title: "ยังไม่มีนัดหมาย",
        fields: [],
        note: "หากต้องการให้ อสม. มาเยี่ยมบ้าน ขอรับบริการได้จากปุ่มด้านล่าง",
        destination: "OPEN_PATIENT_SERVICES",
        actionLabel: "ขอรับบริการ",
        altText: "ยังไม่มีนัดหมายที่กำลังจะมาถึง",
      },
    });
    expect(LINE_APPOINTMENT_REPLY_COPY.EMPTY).toBe("ไม่พบนัดหมายที่กำลังจะมาถึง");
  });
});

describe("ADR-0033 next-appointment reply card", () => {
  it("shows type, Bangkok date and time, location and Hospital, with a button to all appointments", () => {
    const reply = formatLineAppointmentReply({ ...DATA, scheduledAt: new Date("2026-11-12T02:30:00.000Z"), locationType: "HOME_VISIT" });
    if (reply.kind !== "APPOINTMENT") throw new Error("Expected an appointment reply");
    expect(reply.card).toEqual({
      tone: "info",
      title: "นัดหมายถัดไปของคุณ",
      fields: [
        { label: "ประเภท", value: "ติดตาม" },
        { label: "วันเวลา", value: "12 พ.ย. 2569 เวลา 09:30 น." },
        { label: "สถานที่", value: "เยี่ยมบ้าน" },
        { label: "หน่วยบริการ", value: "โรงพยาบาลตัวอย่าง" },
      ],
      destination: "OPEN_PATIENT_APPOINTMENTS",
      actionLabel: "ดูนัดหมายทั้งหมด",
      altText: "นัดหมายถัดไปของคุณ: ติดตาม 12 พ.ย. 2569",
    });
  });

  it("omits the location when the appointment has none, and never shows a Patient, note or assignee field", () => {
    const reply = formatLineAppointmentReply({ ...DATA, locationType: null });
    if (reply.kind !== "APPOINTMENT") throw new Error("Expected an appointment reply");
    expect(reply.card.fields.map(({ label }) => label)).toEqual(["ประเภท", "วันเวลา", "หน่วยบริการ"]);
    expect(reply.card).not.toHaveProperty("note");
  });

  it("follows the lock-screen rule: title, type and date only", () => {
    const reply = formatLineAppointmentReply(DATA);
    if (reply.kind !== "APPOINTMENT") throw new Error("Expected an appointment reply");
    expect(reply.card.altText).toBe("นัดหมายถัดไปของคุณ: ติดตาม 15 ต.ค. 2569");
    expect(reply.card.altText).not.toContain("โรงพยาบาลตัวอย่าง");
    expect(reply.card.altText).not.toMatch(/\d{2}:\d{2}|https?:/u);
  });

  it("normalizes and bounds the Hospital name in the card", () => {
    const normalized = formatLineAppointmentReply({ ...DATA, hospitalName: " โรงพยาบาล\n  ตัวอย่าง​\0  " });
    if (normalized.kind !== "APPOINTMENT") throw new Error("Expected an appointment reply");
    expect(normalized.card.fields.find(({ label }) => label === "หน่วยบริการ")?.value).toBe("โรงพยาบาล ตัวอย่าง");

    const long = formatLineAppointmentReply({ ...DATA, hospitalName: "ก".repeat(300) });
    if (long.kind !== "APPOINTMENT") throw new Error("Expected an appointment reply");
    expect([...(long.card.fields.find(({ label }) => label === "หน่วยบริการ")?.value ?? "")]).toHaveLength(120);
  });
});
