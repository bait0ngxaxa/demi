import { describe, expect, it } from "vitest";

import {
  classifyLineWorkflowRequest,
  LINE_WORKFLOW_APPOINTMENT_HANDLER_PATHS,
  lineWorkflowAppointmentHandlers,
  lineWorkflowAppointmentLinks,
} from "./line-workflow-routes";

const REL = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const read = (pathname: string, method = "GET", serverAction = false) => classifyLineWorkflowRequest({ method, pathname, serverAction });

describe("MINI receiving-route filter", () => {
  it.each(["/line/workflow", "/line/workflow/appointments", `/line/workflow/appointments/${REL}`, `/line/workflow/appointments/${REL}/${APPT}`])(
    "admits GET and HEAD rendering of %s",
    (pathname) => {
      expect(read(pathname)).toBe("PASS");
      expect(read(pathname, "HEAD")).toBe("PASS");
    },
  );

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE"])("rejects %s to a rendering page before action dispatch", (method) => {
    expect(read(`/line/workflow/appointments/${REL}`, method)).toBe("METHOD_NOT_ALLOWED");
    expect(read("/line/workflow", method)).toBe("METHOD_NOT_ALLOWED");
  });

  it("rejects a crafted Next-Action header even on a GET", () => {
    expect(read("/line/workflow/appointments", "GET", true)).toBe("REJECTED");
    expect(read("/line/workflow/appointments", "POST", true)).toBe("METHOD_NOT_ALLOWED");
  });

  it.each([
    "/line/workflow/appointments/",
    "/line/workflow/appointments/not-a-uuid",
    `/line/workflow/appointments/${REL}/${APPT}/extra`,
    `/line/workflow/appointments/${REL}%2F${APPT}`,
    `/line/workflow/appointments/${REL}%2f..%2f${APPT}`,
    "/line/workflow/appointments/..%2F..%2Fapp",
    "/line/workflow/%61ppointments",
    "/%6Cine/workflow/appointments",
    "/line//workflow/appointments",
    "/line/workflow\\appointments",
    "/LINE/workflow/appointments",
    `/line/workflow/appointments/${REL}.png`,
    "/line/workflow/appointments/%E0%A4%A",
    "/api/line/workflow/other",
  ])("does not route the ambiguous or unknown path %s", (pathname) => {
    expect(read(pathname)).toBe("NOT_FOUND");
    expect(read(pathname, "POST", true)).toBe("NOT_FOUND");
  });

  it.each(LINE_WORKFLOW_APPOINTMENT_HANDLER_PATHS)("admits only a plain POST to the fixed handler %s", (pathname) => {
    expect(read(pathname, "POST")).toBe("PASS");
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) expect(read(pathname, method)).toBe("HANDLER_METHOD_NOT_ALLOWED");
    expect(read(pathname, "POST", true)).toBe("REJECTED");
  });

  it.each([
    "/line/workflow/appointments/acknowledge/",
    "/line/workflow/appointments/Acknowledge",
    "/line/workflow/appointments/%61cknowledge",
    "/line/workflow/appointments/cancellation-request/extra",
    `/line/workflow/appointments/${REL}/acknowledge`,
  ])("does not route the near-miss handler path %s", (pathname) => {
    expect(read(pathname, "POST")).toBe("NOT_FOUND");
  });

  it("names the fixed handlers through one adapter", () => {
    expect(lineWorkflowAppointmentHandlers).toEqual({
      acknowledge: "/line/workflow/appointments/acknowledge",
      cancellationRequest: "/line/workflow/appointments/cancellation-request",
    });
  });

  it("leaves the B1 verification endpoint to its own POST-only handler", () => {
    expect(read("/api/line/workflow/verify", "POST")).toBe("PASS");
  });

  it.each(["/app/personal/appointments", "/line/account", "/api/line/account/link", "/login"])("ignores the ordinary route %s", (pathname) => {
    expect(read(pathname, "POST", true)).toBeNull();
  });
});

describe("scoped Appointment link adapter", () => {
  it("builds only fixed scoped destinations", () => {
    expect(lineWorkflowAppointmentLinks.root).toBe("/line/workflow/appointments");
    expect(lineWorkflowAppointmentLinks.history(REL)).toBe(`/line/workflow/appointments/${REL}`);
    expect(lineWorkflowAppointmentLinks.detail(REL, APPT)).toBe(`/line/workflow/appointments/${REL}/${APPT}`);
    expect(lineWorkflowAppointmentLinks.history("../../app")).toBe("/line/workflow/appointments/..%2F..%2Fapp");
    expect(read(lineWorkflowAppointmentLinks.history("../../app"))).toBe("NOT_FOUND");
  });
});
