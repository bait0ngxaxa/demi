import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), setPreference: vi.fn() }));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.actor,
}));
vi.mock("@/modules/appointments/services/appointment-line-notification-preference-service", () => ({
  setOwnAppointmentLineNotificationPreference: mocks.setPreference,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { setAppointmentLineNotificationPreferenceAction } from "./appointment-line-notification-actions";

function form(values: readonly string[]): FormData {
  const result = new FormData();
  for (const value of values) result.append("enabled", value);
  return result;
}

describe("Patient appointment LINE preference action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ userId: "synthetic-user" });
    mocks.setPreference.mockResolvedValue({ enabled: true, canEnable: true });
  });

  it("requires exactly one explicit on/off value before resolving the actor", async () => {
    await expect(setAppointmentLineNotificationPreferenceAction({ status: "IDLE" }, form([])))
      .resolves.toMatchObject({ status: "ERROR" });
    await expect(setAppointmentLineNotificationPreferenceAction({ status: "IDLE" }, form(["true", "false"])))
      .resolves.toMatchObject({ status: "ERROR" });
    await expect(setAppointmentLineNotificationPreferenceAction({ status: "IDLE" }, form(["yes"])))
      .resolves.toMatchObject({ status: "ERROR" });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.setPreference).not.toHaveBeenCalled();
  });

  it("uses the authenticated application actor and purpose-specific preference service", async () => {
    const actor = { userId: "synthetic-user", personId: "synthetic-person", roles: ["PATIENT"] };
    mocks.actor.mockResolvedValue(actor);
    mocks.setPreference.mockResolvedValue({ enabled: false, canEnable: false });

    await expect(setAppointmentLineNotificationPreferenceAction({ status: "IDLE" }, form(["false"])))
      .resolves.toEqual({ status: "SUCCESS", enabled: false, canEnable: false });

    expect(mocks.setPreference).toHaveBeenCalledWith(actor, false);
  });

  it("returns safe feedback when Supabase/application authorization is unavailable", async () => {
    mocks.actor.mockRejectedValue(new Error("private authentication detail"));

    const result = await setAppointmentLineNotificationPreferenceAction({ status: "IDLE" }, form(["true"]));

    expect(result).toMatchObject({ status: "ERROR" });
    expect(JSON.stringify(result)).not.toContain("private authentication detail");
    expect(mocks.setPreference).not.toHaveBeenCalled();
  });

  it("returns generic feedback when preference persistence fails", async () => {
    mocks.setPreference.mockRejectedValue(new Error("private database detail"));

    const result = await setAppointmentLineNotificationPreferenceAction({ status: "IDLE" }, form(["true"]));

    expect(result).toEqual({ status: "ERROR", message: "บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
    expect(JSON.stringify(result)).not.toContain("private database detail");
  });
});
