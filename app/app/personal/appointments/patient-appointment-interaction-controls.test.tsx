import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AppointmentInteractionActionState } from "@/modules/appointments/transport/action-state";
import { PatientAppointmentActionError } from "./patient-appointment-interaction-controls";

describe("Patient appointment interaction errors", () => {
  it("shows the sign-in prompt for an expired session and keeps the existing forbidden copy", () => {
    const expired: AppointmentInteractionActionState = {
      status: "ERROR",
      code: "UNAUTHENTICATED",
      message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
      loginHref: "/login?returnTo=%2Fapp%2Fpersonal%2Fappointments",
    };
    const forbidden: AppointmentInteractionActionState = {
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์จัดการนัดหมายสำหรับผู้ป่วยรายนี้",
    };

    const expiredHtml = renderToStaticMarkup(<PatientAppointmentActionError state={expired} />);
    expect(expiredHtml).toContain("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
    expect(expiredHtml).toContain('href="/login?returnTo=%2Fapp%2Fpersonal%2Fappointments"');

    const forbiddenHtml = renderToStaticMarkup(<PatientAppointmentActionError state={forbidden} />);
    expect(forbiddenHtml).toContain("บัญชีนี้ไม่มีสิทธิ์จัดการนัดหมายสำหรับผู้ป่วยรายนี้");
    expect(forbiddenHtml).not.toContain("เข้าสู่ระบบ DEMI");
  });
});
