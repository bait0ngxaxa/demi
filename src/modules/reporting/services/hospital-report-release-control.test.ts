import { describe, expect, it } from "vitest";

import {
  HOSPITAL_REPORTING_ENABLED_ENV,
  HOSPITAL_REPORTING_PRODUCTION_APPROVED_ENV,
  isHospitalReportingEnabled,
} from "./hospital-report-release-control";

describe("Hospital reporting release control", () => {
  it("requires an explicit opt-in in local development and isolated preview", () => {
    expect(isHospitalReportingEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isHospitalReportingEnabled({ NODE_ENV: "development", [HOSPITAL_REPORTING_ENABLED_ENV]: "false" })).toBe(false);
    expect(isHospitalReportingEnabled({ NODE_ENV: "development", [HOSPITAL_REPORTING_ENABLED_ENV]: "true" })).toBe(true);

    expect(isHospitalReportingEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      [HOSPITAL_REPORTING_ENABLED_ENV]: "true",
    })).toBe(true);
    expect(isHospitalReportingEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    })).toBe(false);
  });

  it("requires a separate production approval switch", () => {
    expect(isHospitalReportingEnabled({ NODE_ENV: "production", [HOSPITAL_REPORTING_ENABLED_ENV]: "true" })).toBe(false);
    expect(isHospitalReportingEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      [HOSPITAL_REPORTING_ENABLED_ENV]: "true",
      [HOSPITAL_REPORTING_PRODUCTION_APPROVED_ENV]: "false",
    })).toBe(false);
    expect(isHospitalReportingEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      [HOSPITAL_REPORTING_ENABLED_ENV]: "true",
      [HOSPITAL_REPORTING_PRODUCTION_APPROVED_ENV]: "true",
    })).toBe(true);
  });

  it("fails closed for unsupported deployment environments", () => {
    expect(isHospitalReportingEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "custom-preview",
      [HOSPITAL_REPORTING_ENABLED_ENV]: "true",
      [HOSPITAL_REPORTING_PRODUCTION_APPROVED_ENV]: "true",
    })).toBe(false);
  });
});
