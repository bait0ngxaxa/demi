import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  report: vi.fn(), verifyAppointment: vi.fn(), verifyMedication: vi.fn(), drainAppointment: vi.fn(), drainMedication: vi.fn(),
}));
vi.mock("@/shared/errors/unexpected-error-report", () => ({ reportUnexpectedError: h.report }));
vi.mock("@/modules/appointments/services/appointment-line-notification-invocation-service", () => ({ verifyAndConsumeAppointmentLineNotificationInvocation: h.verifyAppointment }));
vi.mock("@/modules/appointments/services/appointment-line-notification-delivery-service", () => ({ drainAppointmentLineNotificationOutbox: h.drainAppointment }));
vi.mock("@/modules/medications/services/medication-line-reminder-invocation-service", () => ({ verifyAndConsumeMedicationLineReminderInvocation: h.verifyMedication }));
vi.mock("@/modules/medications/services/medication-line-reminder-delivery-service", () => ({ drainMedicationLineReminderOutbox: h.drainMedication }));

import { ConflictError, ForbiddenError } from "@/shared/errors/application-error";
import { POST as appointmentDrain } from "./appointment-notifications/drain/route";
import { POST as medicationDrain } from "./medication-reminders/drain/route";

const routes = [
  ["appointment", appointmentDrain, h.drainAppointment, h.verifyAppointment, "api.internal.line.appointmentNotificationsDrain"],
  ["medication", medicationDrain, h.drainMedication, h.verifyMedication, "api.internal.line.medicationRemindersDrain"],
] as const;
const request = (): Request => new Request("https://demi.example.org/api/internal/line/drain", { method: "POST" });

beforeEach(() => { vi.resetAllMocks(); });

describe("internal LINE drain routes report the cause of a 503", () => {
  it.each(routes)("%s drain reports an unexpected failure before the generic 503", async (_name, post, drain, _verify, scope) => {
    const failure = new Error("private drain failure");
    drain.mockRejectedValue(failure);
    const response = await post(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
    expect(h.report).toHaveBeenCalledOnce();
    expect(h.report).toHaveBeenCalledWith(scope, failure);
  });

  it.each(routes)("%s drain does not report replay or authorization rejections", async (_name, post, _drain, verify) => {
    verify.mockRejectedValueOnce(new ConflictError());
    expect((await post(request())).status).toBe(409);
    verify.mockRejectedValueOnce(new ForbiddenError());
    expect((await post(request())).status).toBe(404);
    expect(h.report).not.toHaveBeenCalled();
  });
});
