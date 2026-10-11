export const HOSPITAL_REPORTING_ENABLED_ENV = "DEMI_HOSPITAL_REPORTING_ENABLED";
export const HOSPITAL_REPORTING_PRODUCTION_APPROVED_ENV = "DEMI_HOSPITAL_REPORTING_PRODUCTION_APPROVED";

export function isHospitalReportingEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (environment[HOSPITAL_REPORTING_ENABLED_ENV] !== "true") {
    return false;
  }

  return (
    environment.NODE_ENV !== "production" ||
    environment[HOSPITAL_REPORTING_PRODUCTION_APPROVED_ENV] === "true"
  );
}
