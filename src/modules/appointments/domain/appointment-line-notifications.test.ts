import {
  AppointmentLineNotificationEventKind,
  LineReachability,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_LINE_NOTIFICATION_TEXT,
  appointmentLineNotificationRetryDelayMs,
  appointmentLineNotificationSourceKey,
  expectedAppointmentStatusForNotification,
  isFreshLineFriendObservation,
  isInsideLineRetryKeyWindow,
  resolveAppointmentLineNotificationRollout,
} from "./appointment-line-notifications";

describe("appointment LINE notification policy", () => {
  it("keeps rollout OFF unless explicitly enabled with a new UUID generation", () => {
    expect(resolveAppointmentLineNotificationRollout({ enabled: undefined, generation: "valid" })).toEqual({
      enabled: false,
      generation: null,
    });
    expect(resolveAppointmentLineNotificationRollout({ enabled: "true", generation: "invalid" })).toEqual({
      enabled: false,
      generation: null,
    });
    expect(resolveAppointmentLineNotificationRollout({
      enabled: "true",
      generation: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })).toEqual({
      enabled: true,
      generation: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("uses only the approved generic Thai copy and classifies source events", () => {
    expect(APPOINTMENT_LINE_NOTIFICATION_TEXT).toBe(
      "มีข้อมูลใน DEMI อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ",
    );
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
