import { describe, expect, it, vi } from "vitest";

import {
  countCurrentAssignmentsForOsmInHospital,
  formatPatientOsmDisplayName,
  type PatientOsmAssignmentCountDatabase,
} from "./patient-osm-assignment-query-service";

const osmUserId = "11111111-1111-4111-8111-111111111111";
const hospitalId = "22222222-2222-4222-8222-222222222222";

describe("Patient OSM display name", () => {
  it("trims and joins the assigned OSM person name", () => {
    expect(formatPatientOsmDisplayName({ givenName: " สมใจ ", familyName: "อสม. " })).toBe("สมใจ อสม.");
  });

  it("uses the OSM-specific fallback for an unnamed person", () => {
    expect(formatPatientOsmDisplayName({ givenName: null, familyName: null })).toBe("ไม่ระบุชื่อ");
  });
});

describe("raw open Patient-OSM assignment count", () => {
  it("counts open assignment rows in the exact Hospital independently of display eligibility", async () => {
    const count = vi.fn().mockResolvedValue(3);
    const database = { patientOsmAssignment: { count } } as unknown as PatientOsmAssignmentCountDatabase;

    await expect(countCurrentAssignmentsForOsmInHospital(database, { osmUserId, hospitalId })).resolves.toBe(3);
    expect(count).toHaveBeenCalledWith({
      where: {
        osmUserId,
        endedAt: null,
        patientHospitalRelationship: { hospitalId },
      },
    });
  });
});
