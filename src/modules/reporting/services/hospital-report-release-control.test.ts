import { describe, expect, it } from "vitest";

import {
  HOSPITAL_REPORTING_ENABLED_ENV,
  HOSPITAL_REPORTING_PRODUCTION_APPROVED_ENV,
  isHospitalReportingEnabled,
} from "./hospital-report-release-control";

describe("Hospital reporting release control", () => {
  it("stays disabled unless the explicit feature opt-in is true", () => {
    expect(isHospitalReportingEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isHospitalReportingEnabled({ NODE_ENV: "development", [HOSPITAL_REPORTING_ENABLED_ENV]: "false" })).toBe(false);
    expect(isHospitalReportingEnabled({ NODE_ENV: "development", [HOSPITAL_REPORTING_ENABLED_ENV]: "true" })).toBe(true);
  });

  it("requires a separate production approval switch", () => {
    expect(isHospitalReportingEnabled({ NODE_ENV: "production", [HOSPITAL_REPORTING_ENABLED_ENV]: "true" })).toBe(false);
    expect(isHospitalReportingEnabled({
      NODE_ENV: "production",
      [HOSPITAL_REPORTING_ENABLED_ENV]: "true",
      [HOSPITAL_REPORTING_PRODUCTION_APPROVED_ENV]: "true",
    })).toBe(true);
  });
});
