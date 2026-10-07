import { describe, expect, it } from "vitest";

import {
  formatLineAppointmentReply,
  LINE_APPOINTMENT_REPLY_COPY,
} from "./line-appointment-reply";

describe("LINE Patient appointment reply presentation", () => {
  it("formats the approved Thai copy in Bangkok time with Buddhist year and Latin digits", () => {
    expect(
      formatLineAppointmentReply({
        scheduledAt: new Date("2026-10-15T02:00:00.000Z"),
        hospitalName: "โรงพยาบาลตัวอย่าง",
      }),
    ).toBe(
      "นัดหมายถัดไปของคุณ\nวันที่ 15 ตุลาคม 2569 เวลา 09:00 น.\nโรงพยาบาล โรงพยาบาลตัวอย่าง",
    );
  });

  it("handles Bangkok date/year rollover and renders midnight as 00", () => {
    expect(
      formatLineAppointmentReply({
        scheduledAt: new Date("2026-12-31T17:30:00.000Z"),
        hospitalName: "โรงพยาบาลตัวอย่าง",
      }),
    ).toContain("วันที่ 1 มกราคม 2570 เวลา 00:30 น.");
  });

  it("normalizes Hospital display names to one safe line", () => {
    expect(
      formatLineAppointmentReply({
        scheduledAt: new Date("2026-10-15T02:00:00.000Z"),
        hospitalName: " โรงพยาบาล\n  ตัวอย่าง\tกลาง\0  ",
      }),
    ).toContain("โรงพยาบาล โรงพยาบาล ตัวอย่าง กลาง");
  });

  it.each([
    ["EMPTY", LINE_APPOINTMENT_REPLY_COPY.EMPTY],
    ["INELIGIBLE", LINE_APPOINTMENT_REPLY_COPY.INELIGIBLE],
    ["INFRASTRUCTURE_FAILURE", LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE],
  ] as const)("uses the exact %s copy", (category, copy) => {
    expect(formatLineAppointmentReply(category)).toBe(copy);
  });

  it("uses infrastructure copy when the date or Hospital name is unusable", () => {
    expect(
      formatLineAppointmentReply({ scheduledAt: new Date(Number.NaN), hospitalName: "Hospital" }),
    ).toBe(LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE);
    expect(
      formatLineAppointmentReply({ scheduledAt: new Date(), hospitalName: " \n\t " }),
    ).toBe(LINE_APPOINTMENT_REPLY_COPY.INFRASTRUCTURE_FAILURE);
  });

  it("does not append status, identifiers, or navigation", () => {
    const reply = formatLineAppointmentReply({
      scheduledAt: new Date("2026-10-15T02:00:00.000Z"),
      hospitalName: "โรงพยาบาลตัวอย่าง",
    });

    expect(reply.split("\n")).toHaveLength(3);
    expect(reply).not.toMatch(/SCHEDULED|CANCELLED|appointment|relationship|patient|https?:|\/app\//iu);
  });
});
