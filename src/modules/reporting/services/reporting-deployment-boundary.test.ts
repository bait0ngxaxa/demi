import { describe, expect, it } from "vitest";

import {
  classifyReportingDeployment,
  isReportingAvailableInCurrentDeployment,
  TRUSTED_DEMI_UAT_VERCEL_PROJECT_ID,
} from "./reporting-deployment-boundary";

const uatEnvironment = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: TRUSTED_DEMI_UAT_VERCEL_PROJECT_ID,
};

describe("reporting deployment boundary", () => {
  it("allows local development without reporting flags", () => {
    const environment = { NODE_ENV: "development" };

    expect(classifyReportingDeployment(environment)).toBe("LOCAL_DEVELOPMENT");
    expect(isReportingAvailableInCurrentDeployment(environment)).toBe(true);
  });

  it("recognizes the trusted UAT project even when Vercel labels its deployment production", () => {
    expect(classifyReportingDeployment(uatEnvironment)).toBe("DEMI_UAT");
    expect(isReportingAvailableInCurrentDeployment(uatEnvironment)).toBe(true);
  });

  it("denies other production projects and unknown deployments", () => {
    const actualProduction = {
      ...uatEnvironment,
      VERCEL_PROJECT_ID: "prj_actual_production",
    };
    const unknownPreview = {
      ...uatEnvironment,
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_ID: "prj_unknown_preview",
    };
    const missingProjectIdentity = {
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "production",
    };

    expect(classifyReportingDeployment(actualProduction)).toBe("PRODUCTION");
    expect(classifyReportingDeployment(unknownPreview)).toBe("UNTRUSTED");
    expect(classifyReportingDeployment(missingProjectIdentity)).toBe("UNTRUSTED");
    expect(isReportingAvailableInCurrentDeployment(actualProduction)).toBe(false);
    expect(isReportingAvailableInCurrentDeployment(unknownPreview)).toBe(false);
    expect(isReportingAvailableInCurrentDeployment(missingProjectIdentity)).toBe(false);
  });

  it("does not infer local development from partial or forged Vercel metadata", () => {
    const environment = {
      NODE_ENV: "development",
      VERCEL_ENV: "development",
    };

    expect(classifyReportingDeployment(environment)).toBe("UNTRUSTED");
    expect(isReportingAvailableInCurrentDeployment(environment)).toBe(false);
  });
});
