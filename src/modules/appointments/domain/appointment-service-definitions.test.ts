import { describe, expect, it } from "vitest";

import { SERVICE_APPOINTMENT_TYPE, isOneOffVisitOsm } from "./appointment-service-definitions";

describe("Appointment service definitions (ADR-0023)", () => {
  it("derives the appointment type from the requested service", () => {
    expect(SERVICE_APPOINTMENT_TYPE).toEqual({
      SCREENING: "ASSESSMENT",
      FOLLOW_UP: "FOLLOW_UP",
      EMPOWERMENT: "EDUCATION",
    });
  });

  describe("isOneOffVisitOsm", () => {
    const assigned = "assigned-osm";
    const other = "other-osm";

    it("is a one-off visit when the appointment names an อสม. other than the assigned one", () => {
      expect(isOneOffVisitOsm({ appointmentOsmUserId: other, assignedOsmUserId: assigned })).toBe(true);
    });

    it("is a one-off visit when the patient has no assigned อสม.", () => {
      expect(isOneOffVisitOsm({ appointmentOsmUserId: other, assignedOsmUserId: null })).toBe(true);
    });

    it("is not a one-off visit for the assigned อสม.", () => {
      expect(isOneOffVisitOsm({ appointmentOsmUserId: assigned, assignedOsmUserId: assigned })).toBe(false);
    });

    it("is not a one-off visit without an อสม.", () => {
      expect(isOneOffVisitOsm({ appointmentOsmUserId: null, assignedOsmUserId: assigned })).toBe(false);
    });

    it("is a one-off visit for a hospital-booked appointment with another อสม. (ADR-0027)", () => {
      expect(isOneOffVisitOsm({ appointmentOsmUserId: other, assignedOsmUserId: assigned })).toBe(true);
    });
  });
});
