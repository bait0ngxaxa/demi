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
    const requestId = "6a7c9b0e-2d1f-4c3a-9e8b-1f2a3b4c5d6e";
    const assigned = "assigned-osm";
    const other = "other-osm";

    it("is a one-off visit when a request books an อสม. other than the assigned one", () => {
      expect(isOneOffVisitOsm({ appointmentOsmUserId: other, assignedOsmUserId: assigned, sourceServiceRequestId: requestId })).toBe(true);
    });

    it("is a one-off visit when the patient has no assigned อสม.", () => {
      expect(isOneOffVisitOsm({ appointmentOsmUserId: other, assignedOsmUserId: null, sourceServiceRequestId: requestId })).toBe(true);
    });

    it("is not a one-off visit for the assigned อสม.", () => {
      expect(isOneOffVisitOsm({ appointmentOsmUserId: assigned, assignedOsmUserId: assigned, sourceServiceRequestId: requestId })).toBe(false);
    });

    it("is not a one-off visit without an อสม.", () => {
      expect(isOneOffVisitOsm({ appointmentOsmUserId: null, assignedOsmUserId: assigned, sourceServiceRequestId: requestId })).toBe(false);
    });

    it("is not a one-off visit for a hospital-booked appointment", () => {
      expect(isOneOffVisitOsm({ appointmentOsmUserId: other, assignedOsmUserId: assigned, sourceServiceRequestId: null })).toBe(false);
    });
  });
});
