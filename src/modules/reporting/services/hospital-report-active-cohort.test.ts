import { describe, expect, it } from "vitest";

import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";

describe("ACTIVE report cohort predicate", () => {
  it("is exactly the predicate the grouped Parent area SQL repeats", () => {
    // `loadParentChildHospitalReportingSourceSnapshots` (hospital-report-query-service.ts) spells this predicate as
    // `r."endedAt" IS NULL` in raw SQL. When this changes, change that statement in the same commit.
    expect(activePatientHospitalRelationshipWhere).toStrictEqual({ endedAt: null });
  });
});
