import {
  AppointmentLineNotificationEventKind,
  LineReachability,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  appointmentLineNotificationText,
  appointmentLineNotificationRetryDelayMs,
  appointmentLineNotificationSourceKey,
  expectedAppointmentStatusForNotification,
  isFreshLineFriendObservation,
  isInsideLineRetryKeyWindow,
  patientServiceRequestLineNotificationText,
} from "./appointment-line-notifications";

describe("service request LINE notification text (ADR-0023 SR-B)", () => {
  it("names the service, the calendar date in Thai and the slot, and nothing about the patient", () => {
    expect(patientServiceRequestLineNotificationText({
      serviceCode: "EMPOWERMENT",
      preferredDate: new Date("2026-11-02T00:00:00.000Z"),
      preferredSlot: "AFTERNOON",
    })).toBe("มีคำขอรับบริการเสริมพลังใจ วันที่ 2 พฤศจิกายน 2569 บ่าย กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ");
    expect(patientServiceRequestLineNotificationText({ serviceCode: "SCREENING", preferredDate: null, preferredSlot: null }))
      .toBe("มีคำขอรับบริการคัดกรอง กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ");
  });
});

describe("appointment LINE notification policy", () => {
  it.each([
    ["FOLLOW_UP", "ติดตาม"],
    ["ASSESSMENT", "ประเมิน"],
    ["EDUCATION", "ให้ความรู้"],
  ] as const)("uses the approved label for LINE messages for %s", (type, label) => {
    expect(appointmentLineNotificationText(type)).toBe(
      `มีนัดหมายประเภท ${label} อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ`,
    );
  });

  it("classifies source events", () => {
    expect(expectedAppointmentStatusForNotification(AppointmentLineNotificationEventKind.CREATED)).toBe("SCHEDULED");
    expect(expectedAppointmentStatusForNotification(AppointmentLineNotificationEventKind.RESCHEDULED)).toBe("SCHEDULED");
    expect(expectedAppointmentStatusForNotification(AppointmentLineNotificationEventKind.CANCELLED)).toBe("CANCELLED");
    expect(appointmentLineNotificationSourceKey(
      "appt-1",
      new Date("2026-10-09T00:00:00.000Z"),
    )).toBe("appt-1:2026-10-09T00:00:00.000Z");
  });

  it("requires fresh known friendship and stops before LINE's retry-key window closes", () => {
    const now = new Date("2026-10-09T00:00:00.000Z");
    expect(isFreshLineFriendObservation({
      reachability: LineReachability.FRIEND,
      observedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      now,
    })).toBe(true);
    expect(isFreshLineFriendObservation({
      reachability: LineReachability.FRIEND,
      observedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000 - 1),
      now,
    })).toBe(false);
    expect(isFreshLineFriendObservation({ reachability: LineReachability.UNKNOWN, observedAt: now, now })).toBe(false);
    expect(isFreshLineFriendObservation({ reachability: LineReachability.NOT_FRIEND, observedAt: now, now })).toBe(false);
    expect(isInsideLineRetryKeyWindow(now, new Date(now.getTime() + 22 * 60 * 60 * 1000))).toBe(true);
    expect(isInsideLineRetryKeyWindow(now, new Date(now.getTime() + 23 * 60 * 60 * 1000))).toBe(false);
  });

  it("bounds jitter around the approved one-minute and four-minute retry delays", () => {
    expect(appointmentLineNotificationRetryDelayMs(1, () => 0)).toBe(54_000);
    expect(appointmentLineNotificationRetryDelayMs(1, () => 0.5)).toBe(60_000);
    expect(appointmentLineNotificationRetryDelayMs(1, () => 1)).toBe(66_000);
    expect(appointmentLineNotificationRetryDelayMs(2, () => 0)).toBe(216_000);
    expect(appointmentLineNotificationRetryDelayMs(2, () => 1)).toBe(264_000);
    expect(() => appointmentLineNotificationRetryDelayMs(3)).toThrow(RangeError);
  });
});
