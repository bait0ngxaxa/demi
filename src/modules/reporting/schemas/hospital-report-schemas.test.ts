import { describe, expect, it } from "vitest";

import {
  hospitalReportExportRequestSchema,
  hospitalReportPageRequestSchema,
  parentChildHospitalReportRequestSchema,
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
