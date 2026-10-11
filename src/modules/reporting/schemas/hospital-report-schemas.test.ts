import { describe, expect, it } from "vitest";

import {
  hospitalReportExportRequestSchema,
  hospitalReportPageRequestSchema,
} from "./hospital-report-schemas";

const hospitalId = "11111111-1111-4111-8111-111111111111";

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
});
