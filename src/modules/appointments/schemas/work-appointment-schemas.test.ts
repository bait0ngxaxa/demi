import { describe, expect, it } from "vitest";

import { workAppointmentFiltersSchema, workAppointmentQuerySchema } from "./work-appointment-schemas";

const hospitalId = "11111111-1111-4111-8111-111111111111";

describe("work appointment query schema: unassigned filter", () => {
  it("accepts unassigned=true on the query and the filters, alone or with unassignedOsm", () => {
    expect(workAppointmentQuerySchema.parse({ hospitalId, tab: "UPCOMING", unassigned: "true" }))
      .toEqual({ hospitalId, tab: "UPCOMING", unassigned: "true" });
    expect(workAppointmentQuerySchema.parse({ hospitalId, tab: "UPCOMING", unassigned: "true", unassignedOsm: "true" }))
      .toMatchObject({ unassigned: "true", unassignedOsm: "true" });
    expect(workAppointmentFiltersSchema.parse({ unassigned: "true" })).toEqual({ unassigned: "true" });
  });

  it("leaves the filter absent when it is not sent", () => {
    expect(workAppointmentQuerySchema.parse({ hospitalId }).unassigned).toBeUndefined();
  });

  it.each(["false", "1", "", "TRUE"])("rejects unassigned=%j", (value) => {
    expect(workAppointmentQuerySchema.safeParse({ hospitalId, unassigned: value }).success).toBe(false);
    expect(workAppointmentFiltersSchema.safeParse({ unassigned: value }).success).toBe(false);
  });
});
