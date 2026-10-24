import { describe, expect, it } from "vitest";

import { projectAppointmentContactPhones } from "./appointment-contact-phones";

const source = { assignedOsmPhone: null, hospitalPhone: " 02-123-4567 ", patientPhone: "0812345678" };

describe("E4 appointment contact phone projection", () => {
  it("gives the assigned OSM / Hospital staff both phones", () => {
    expect(projectAppointmentContactPhones(source, "ASSIGNED_OSM_OR_HOSPITAL_STAFF")).toEqual({
      assignedOsmPhone: null, hospitalPhone: "02-123-4567",
      patientPhone: "0812345678",
    });
  });

  it.each(["PATIENT_SELF", "CAREGIVER_GRANT"] as const)("gives %s the Hospital phone only", (audience) => {
    expect(projectAppointmentContactPhones(source, audience)).toEqual({
      assignedOsmPhone: null, hospitalPhone: "02-123-4567",
      patientPhone: null,
    });
  });

  it("treats blank numbers as missing", () => {
    expect(projectAppointmentContactPhones({ assignedOsmPhone: null, hospitalPhone: "  ", patientPhone: "" }, "ASSIGNED_OSM_OR_HOSPITAL_STAFF")).toEqual({
      assignedOsmPhone: null, hospitalPhone: null,
      patientPhone: null,
    });
  });
});

describe("WF-PHONE audience extension", () => {
  const source = { hospitalPhone: "021234567", patientPhone: "0899999999", assignedOsmPhone: "0812345678" };
  it.each(["PATIENT_SELF", "HOSPITAL_STAFF"] as const)("shows the current assigned OSM to %s", (audience) => {
    expect(projectAppointmentContactPhones(source, audience).assignedOsmPhone).toBe("0812345678");
  });
  it.each(["CAREGIVER_GRANT", "ASSIGNED_OSM_OR_HOSPITAL_STAFF"] as const)("withholds workforce phones from %s", (audience) => {
    expect(projectAppointmentContactPhones(source, audience).assignedOsmPhone).toBeNull();
  });
});
