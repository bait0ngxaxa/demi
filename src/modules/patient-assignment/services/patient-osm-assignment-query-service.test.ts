import { describe, expect, it } from "vitest";

import { formatPatientOsmDisplayName } from "./patient-osm-assignment-query-service";

describe("Patient OSM display name", () => {
  it("trims and joins the assigned OSM person name", () => {
    expect(formatPatientOsmDisplayName({ givenName: " สมใจ ", familyName: "อสม. " })).toBe("สมใจ อสม.");
  });

  it("uses the OSM-specific fallback for an unnamed person", () => {
    expect(formatPatientOsmDisplayName({ givenName: null, familyName: null })).toBe("ไม่ระบุชื่อ");
  });
});
