import "server-only";

export const TRUSTED_DEMI_UAT_VERCEL_PROJECT_ID = "prj_QXcjnZaz0tqiaEJdWSlzy4yuk49p";

export type ReportingDeploymentClassification =
  | "LOCAL_DEVELOPMENT"
  | "DEMI_UAT"
  | "PRODUCTION"
  | "UNTRUSTED";

export function classifyReportingDeployment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ReportingDeploymentClassification {
  const hasVercelMetadata =
    environment.VERCEL !== undefined ||
    environment.VERCEL_ENV !== undefined ||
    environment.VERCEL_PROJECT_ID !== undefined;

  if (!hasVercelMetadata && environment.NODE_ENV === "development") {
    return "LOCAL_DEVELOPMENT";
  }

  if (environment.VERCEL !== "1" || !environment.VERCEL_PROJECT_ID) {
    return "UNTRUSTED";
  }

  if (environment.VERCEL_PROJECT_ID === TRUSTED_DEMI_UAT_VERCEL_PROJECT_ID) {
    return "DEMI_UAT";
  }

  if (environment.VERCEL_ENV === "production") {
    return "PRODUCTION";
  }

  return "UNTRUSTED";
}

export function isReportingAvailableInCurrentDeployment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const classification = classifyReportingDeployment(environment);
  return classification === "LOCAL_DEVELOPMENT" || classification === "DEMI_UAT";
}
