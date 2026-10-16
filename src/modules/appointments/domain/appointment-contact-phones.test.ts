import { describe, expect, it } from "vitest";

import { projectAppointmentContactPhones } from "./appointment-contact-phones";

const source = { hospitalPhone: " 02-123-4567 ", patientPhone: "0812345678" };

describe("E4 appointment contact phone projection", () => {
  it("gives the assigned OSM / Hospital staff both phones", () => {
    expect(projectAppointmentContactPhones(source, "ASSIGNED_OSM_OR_HOSPITAL_STAFF")).toEqual({
      hospitalPhone: "02-123-4567",
      patientPhone: "0812345678",
    });
  });

  it.each(["PATIENT_SELF", "CAREGIVER_GRANT"] as const)("gives %s the Hospital phone only", (audience) => {
    expect(projectAppointmentContactPhones(source, audience)).toEqual({
      hospitalPhone: "02-123-4567",
      patientPhone: null,
    });
  });

  it("treats blank numbers as missing", () => {
    expect(projectAppointmentContactPhones({ hospitalPhone: "  ", patientPhone: "" }, "ASSIGNED_OSM_OR_HOSPITAL_STAFF")).toEqual({
      hospitalPhone: null,
      patientPhone: null,
    });
  });
});
