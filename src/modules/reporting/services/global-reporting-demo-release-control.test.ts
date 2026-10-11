import { describe, expect, it } from "vitest";

import {
  GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS_ENV,
  GLOBAL_REPORTING_DEMO_ENABLED_ENV,
  GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL_ENV,
  getDesignatedGlobalReportingDatabaseName,
  getGlobalReportingDemoAdminUserIds,
  isGlobalReportingDemoAdminConfigured,
  isGlobalReportingDemoDeploymentEnabled,
} from "./global-reporting-demo-release-control";

const demoAdminId = "22222222-2222-4222-8222-222222222222";
const demoDatabaseUrl = "postgresql://demo:secret@127.0.0.1:5432/demi_synthetic";

function configuredEnvironment(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: "development",
    [GLOBAL_REPORTING_DEMO_ENABLED_ENV]: "true",
    [GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS_ENV]: demoAdminId,
    DATABASE_URL: demoDatabaseUrl,
    [GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL_ENV]: demoDatabaseUrl,
    ...overrides,
  };
}

describe("Global Reporting synthetic-demo release control", () => {
  it("requires explicit opt-in, a designated PostgreSQL URL, and an allowed deployment", () => {
    expect(isGlobalReportingDemoDeploymentEnabled(configuredEnvironment())).toBe(true);
    expect(isGlobalReportingDemoDeploymentEnabled(configuredEnvironment({ [GLOBAL_REPORTING_DEMO_ENABLED_ENV]: "false" }))).toBe(false);
    expect(isGlobalReportingDemoDeploymentEnabled(configuredEnvironment({ [GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL_ENV]: undefined }))).toBe(false);
    expect(isGlobalReportingDemoDeploymentEnabled(configuredEnvironment({ DATABASE_URL: "postgresql://demo:secret@127.0.0.1:5432/other_db" }))).toBe(false);
  });

  it("allows only local development or Preview and always blocks production", () => {
    expect(isGlobalReportingDemoDeploymentEnabled(configuredEnvironment({ NODE_ENV: "production", VERCEL_ENV: "preview" }))).toBe(true);
    expect(isGlobalReportingDemoDeploymentEnabled(configuredEnvironment({ NODE_ENV: "production", VERCEL_ENV: "production" }))).toBe(false);
    expect(isGlobalReportingDemoDeploymentEnabled(configuredEnvironment({ NODE_ENV: "production" }))).toBe(false);
    expect(isGlobalReportingDemoDeploymentEnabled(configuredEnvironment({ VERCEL_ENV: "custom-preview" }))).toBe(false);
  });

  it("requires a valid explicit ADMIN identity and exposes the designated database name only server-side", () => {
    const environment = configuredEnvironment({
      [GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS_ENV]: `${demoAdminId}, ${demoAdminId.toUpperCase()}`,
    });
    expect(getGlobalReportingDemoAdminUserIds(environment)).toEqual([demoAdminId]);
    expect(isGlobalReportingDemoAdminConfigured(demoAdminId, environment)).toBe(true);
    expect(isGlobalReportingDemoAdminConfigured("33333333-3333-4333-8333-333333333333", environment)).toBe(false);
    expect(getDesignatedGlobalReportingDatabaseName(environment)).toBe("demi_synthetic");
    expect(getGlobalReportingDemoAdminUserIds(configuredEnvironment({
      [GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS_ENV]: `${demoAdminId},invalid`,
    }))).toEqual([]);
  });
});
