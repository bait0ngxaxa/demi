export const HOSPITAL_REPORTING_ENABLED_ENV = "DEMI_HOSPITAL_REPORTING_ENABLED";
export const HOSPITAL_REPORTING_PRODUCTION_APPROVED_ENV = "DEMI_HOSPITAL_REPORTING_PRODUCTION_APPROVED";

export function isHospitalReportingEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (environment[HOSPITAL_REPORTING_ENABLED_ENV] !== "true") {
    return false;
  }

  const deploymentEnvironment = environment.VERCEL_ENV;
  const isProduction = deploymentEnvironment === "production" ||
    (deploymentEnvironment === undefined && environment.NODE_ENV === "production");

  if (isProduction) {
    return environment[HOSPITAL_REPORTING_PRODUCTION_APPROVED_ENV] === "true";
  }

  if (deploymentEnvironment !== undefined) {
    return deploymentEnvironment === "preview" || deploymentEnvironment === "development";
  }

  return environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
}
