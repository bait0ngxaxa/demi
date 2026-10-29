import { describe, expect, it } from "vitest";

import { CARE_STAGES } from "@/modules/care-tracking/domain/care-stage";
import { PATIENT_DIRECTORY_NAME_MAX_LENGTH } from "@/modules/patient-directory/schemas/patient-directory-schemas";

import { parseServicesFilters, servicesHref, toggleValue } from "./services-url";

const hospitalId = "11111111-1111-4111-8111-111111111111";

describe("CT-2 services URL state", () => {
  it("reads repeatable stage and signal params in catalog order without duplicates", () => {
    expect(parseServicesFilters({
      stage: ["IN_ROUND", "NOT_STARTED", "IN_ROUND"],
      signal: ["stale", "overdueAppointment"],
      search: "  สมชาย  ",
      includeEnded: "1",
      page: "3",
    })).toEqual({
      stages: ["NOT_STARTED", "IN_ROUND"],
      signals: ["overdueAppointment", "stale"],
      search: "สมชาย",
      includeEnded: true,
      page: 3,
    });
  });

  it.each([
    { stage: "BOGUS" },
    { signal: ["late", ""] },
    { search: "ก".repeat(PATIENT_DIRECTORY_NAME_MAX_LENGTH + 1) },
    { includeEnded: "true" },
    { page: "0" },
    { page: "-2" },
    { page: "1.5" },
    { page: "abc" },
    { page: "9".repeat(30) },
  ])("falls back to the defaults for invalid values (%j)", (params) => {
    expect(parseServicesFilters(params)).toEqual({ stages: [], signals: [], search: "", includeEnded: false, page: 1 });
  });

  it("writes only non-default params and round-trips", () => {
    expect(servicesHref({ hospitalId, stages: [], signals: [], search: "", includeEnded: false, page: 1 }))
      .toBe(`/app/services?hospitalId=${hospitalId}`);

    const href = servicesHref({ hospitalId, stages: ["IN_ROUND", "AWAITING_AFTER"], signals: ["stale"], search: "HN 1", includeEnded: true, page: 4 });
    const params = new URL(href, "https://demi.test").searchParams;
    expect(Object.fromEntries([...params.keys()].map((key) => [key, params.getAll(key)]))).toEqual({
      hospitalId: [hospitalId],
      stage: ["IN_ROUND", "AWAITING_AFTER"],
      signal: ["stale"],
      search: ["HN 1"],
      includeEnded: ["1"],
      page: ["4"],
    });
    expect(parseServicesFilters(Object.fromEntries([...params.keys()].map((key) => [key, params.getAll(key)])))).toEqual({
      stages: ["IN_ROUND", "AWAITING_AFTER"],
      signals: ["stale"],
      search: "HN 1",
      includeEnded: true,
      page: 4,
    });
  });

  it("toggles one value and keeps catalog order", () => {
    expect(toggleValue(CARE_STAGES, ["IN_ROUND"], "NOT_STARTED")).toEqual(["NOT_STARTED", "IN_ROUND"]);
    expect(toggleValue(CARE_STAGES, ["NOT_STARTED", "IN_ROUND"], "IN_ROUND")).toEqual(["NOT_STARTED"]);
  });
});
