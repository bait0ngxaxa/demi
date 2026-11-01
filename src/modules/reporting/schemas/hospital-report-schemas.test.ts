import { describe, expect, it } from "vitest";

import {
  hospitalReportExportRequestSchema,
  hospitalReportPageRequestSchema,
  networkReportExportRequestSchema,
  parentChildHospitalReportRequestSchema,
  parseNetworkReportExportQuery,
  parseHospitalReportTargetSelection,
} from "./hospital-report-schemas";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const childHospitalId = "22222222-2222-4222-8222-222222222222";

describe("Hospital reporting request schemas", () => {
  it("accepts only bounded pagination and a strict Hospital scope", () => {
    expect(hospitalReportPageRequestSchema.parse({ hospitalId, cursor: "cursor", pageSize: "50" })).toEqual({
      hospitalId,
      cursor: "cursor",
      pageSize: 50,
      search: "", progress: "", status: "",
    });
    expect(hospitalReportPageRequestSchema.safeParse({ hospitalId, pageSize: 51 }).success).toBe(false);
    expect(hospitalReportPageRequestSchema.safeParse({ hospitalId, prismaWhere: {} }).success).toBe(false);
    expect(hospitalReportExportRequestSchema.safeParse({ hospitalId, cursor: "unbounded" }).success).toBe(false);
  });

  it("validates explicit direct and Parent-to-Child target locators", () => {
    expect(parseHospitalReportTargetSelection(`DIRECT_OWNER:${hospitalId}`)).toEqual({
      kind: "DIRECT_OWNER",
      hospitalId,
    });
    expect(parseHospitalReportTargetSelection(`PARENT_CHILD:${hospitalId}:${childHospitalId}`)).toEqual({
      kind: "PARENT_CHILD",
      parentHospitalId: hospitalId,
      hospitalId: childHospitalId,
    });
    expect(parseHospitalReportTargetSelection(`PARENT_CHILD:${hospitalId}:${hospitalId}`)).toBeNull();
    expect(parseHospitalReportTargetSelection(`PARENT_CHILD:${hospitalId}:${childHospitalId}:extra`)).toBeNull();
    expect(parentChildHospitalReportRequestSchema.safeParse({
      parentHospitalId: hospitalId,
      hospitalId: childHospitalId,
    }).success).toBe(true);
    expect(parentChildHospitalReportRequestSchema.safeParse({
      parentHospitalId: hospitalId,
      hospitalId: childHospitalId,
      cursor: "direct-owner-cursor",
    }).success).toBe(false);
  });
});

describe("ADR-0025 network report export request", () => {
  const query = (value: string): ReturnType<typeof parseNetworkReportExportQuery> =>
    parseNetworkReportExportQuery(new URLSearchParams(value));

  it("expands scope=ALL on the server and keeps an explicit selection deduplicated and lower-cased", () => {
    expect(query(`parentHospitalId=${hospitalId}&scope=ALL`)).toEqual({ parentHospitalId: hospitalId, hospitalIds: "ALL" });
    expect(query(`parentHospitalId=${hospitalId}&hospitalId=${childHospitalId.toUpperCase()}&hospitalId=${childHospitalId}&cohort=INCLUDE_ENDED`)).toEqual({
      parentHospitalId: hospitalId,
      hospitalIds: [childHospitalId],
      cohort: "INCLUDE_ENDED",
    });
  });

  it.each([
    "",
    `scope=ALL`,
    `parentHospitalId=${hospitalId}`,
    `parentHospitalId=${hospitalId}&parentHospitalId=${hospitalId}&scope=ALL`,
    `parentHospitalId=${hospitalId}&scope=ALL&hospitalId=${childHospitalId}`,
    `parentHospitalId=${hospitalId}&scope=ALL&scope=ALL`,
    `parentHospitalId=${hospitalId}&scope=NETWORK`,
    `parentHospitalId=${hospitalId}&scope=ALL&cohort=ENDED`,
    `parentHospitalId=${hospitalId}&scope=ALL&cohort=ACTIVE&cohort=ACTIVE`,
    `parentHospitalId=${hospitalId}&hospitalId=not-a-uuid`,
    `parentHospitalId=${hospitalId}&scope=ALL&format=csv`,
  ])("rejects the strict query %j", (value) => {
    expect(query(value)).toBeNull();
  });

  it("caps an explicit selection at 200 Hospitals before deduplication", () => {
    const ids = Array.from({ length: 201 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`);
    expect(networkReportExportRequestSchema.safeParse({ parentHospitalId: hospitalId, hospitalIds: ids }).success).toBe(false);
    expect(networkReportExportRequestSchema.safeParse({ parentHospitalId: hospitalId, hospitalIds: ids.slice(0, 200) }).success).toBe(true);
    expect(networkReportExportRequestSchema.safeParse({ parentHospitalId: hospitalId, hospitalIds: [] }).success).toBe(false);
  });
});
