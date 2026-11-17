import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, InfrastructureError, UnauthenticatedError } from "@/shared/errors/application-error";
import { toInfrastructureError } from "@/shared/errors/unexpected-error-report";

const { getActor, setAppointmentPreference, setMedicationPreference } = vi.hoisted(() => ({
  getActor: vi.fn(),
  setAppointmentPreference: vi.fn(),
  setMedicationPreference: vi.fn(),
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: getActor }));
vi.mock("@/modules/appointments/services/appointment-line-notification-preference-service", () => ({
  setOwnAppointmentLineNotificationPreference: setAppointmentPreference,
}));
vi.mock("@/modules/medications/services/medication-line-reminder-preference-service", () => ({
  setOwnMedicationLineReminderPreference: setMedicationPreference,
}));
vi.mock("../services/contact-setting-service", () => ({ updateOwnContactEmail: vi.fn() }));

import { setAppointmentLineNotificationsAction, setMedicationLineRemindersAction } from "./server-actions";

const actor = { userId: "synthetic-user" };
const genericMessage = "บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่";

const actions = [
  {
    action: setAppointmentLineNotificationsAction,
    service: setAppointmentPreference,
    scope: "account-settings.setAppointmentLineNotificationsAction",
    lineMessage: "บันทึกการแจ้งเตือนนัดหมายไม่สำเร็จ กรุณาตรวจสอบการเชื่อม LINE",
  },
  {
    action: setMedicationLineRemindersAction,
    service: setMedicationPreference,
    scope: "account-settings.setMedicationLineRemindersAction",
    lineMessage: "บันทึกการแจ้งเตือนยาไม่สำเร็จ กรุณาตรวจสอบการเชื่อม LINE",
  },
];

describe.each(actions)("$scope", ({ action, service, scope, lineMessage }) => {
  beforeEach(() => {
    vi.resetAllMocks();
    getActor.mockResolvedValue(actor);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("rejects non-boolean input before accessing authentication or preferences", async () => {
    // @ts-expect-error Exercise the untrusted server-action input boundary.
    expect(await action("true")).toEqual({ status: "ERROR", message: "ข้อมูลการแจ้งเตือนไม่ถูกต้อง" });
    expect(getActor).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([true, false])("returns the persisted preference for %s", async (enabled) => {
    service.mockResolvedValue({ enabled, canEnable: true });
    expect(await action(enabled)).toEqual({ status: "SUCCESS", enabled });
    expect(service).toHaveBeenCalledWith(actor, enabled);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps the LINE-specific message for binding or eligibility refusal", async () => {
    service.mockRejectedValue(new ForbiddenError());
    expect(await action(true)).toEqual({ status: "ERROR", message: lineMessage });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("uses the existing account-settings auth message for an unauthenticated session", async () => {
    getActor.mockRejectedValue(new UnauthenticatedError());
    expect(await action(true)).toEqual({ status: "ERROR", message: "บัญชีนี้ไม่มีสิทธิ์แก้ไขการตั้งค่า" });
    expect(service).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("sanitizes and reports a raw database failure under the action scope", async () => {
    service.mockRejectedValue(new Error("sensitive database detail"));
    expect(await action(false)).toEqual({ status: "ERROR", message: genericMessage });
    expect(console.error).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ scope }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("sensitive database detail");
  });

  it("uses the generic message for an infrastructure error", async () => {
    service.mockRejectedValue(new InfrastructureError("sensitive infrastructure detail"));
    expect(await action(true)).toEqual({ status: "ERROR", message: genericMessage });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("does not report a service-converted infrastructure failure twice", async () => {
    const error = toInfrastructureError("preference-service", new Error("sensitive database detail"));
    service.mockRejectedValue(error);
    expect(await action(true)).toEqual({ status: "ERROR", message: genericMessage });
    expect(console.error).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ scope: "preference-service" }));
  });

  it("sanitizes and reports an unexpected authentication lookup failure", async () => {
    getActor.mockRejectedValue(new Error("sensitive auth provider detail"));
    expect(await action(true)).toEqual({ status: "ERROR", message: genericMessage });
    expect(service).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ scope }));
  });
});
