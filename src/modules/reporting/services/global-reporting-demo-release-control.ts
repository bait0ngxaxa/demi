import { z } from "zod";

export const GLOBAL_REPORTING_DEMO_ENABLED_ENV = "DEMI_GLOBAL_REPORTING_DEMO_ENABLED";
export const GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS_ENV = "DEMI_GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS";
export const GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL_ENV = "DEMI_GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL";

const uuidSchema = z.string().uuid();

function designatedDatabaseName(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    return parsed.hostname && databaseName ? databaseName : null;
  } catch {
    return null;
  }
}

export function isGlobalReportingDemoDeploymentEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (environment[GLOBAL_REPORTING_DEMO_ENABLED_ENV] !== "true") return false;

  const vercelEnvironment = environment.VERCEL_ENV;
  if (vercelEnvironment === "production") return false;
  if (vercelEnvironment !== undefined && !["preview", "development"].includes(vercelEnvironment)) {
    return false;
  }
  if (environment.NODE_ENV === "production" && vercelEnvironment !== "preview") return false;
  if (
    vercelEnvironment !== "preview" &&
    environment.NODE_ENV !== "development" &&
    environment.NODE_ENV !== "test" &&
    vercelEnvironment !== "development"
  ) {
    return false;
  }

  const runtimeDatabaseUrl = environment.DATABASE_URL;
  const designatedDatabaseUrl = environment[GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL_ENV];
  if (!runtimeDatabaseUrl || !designatedDatabaseUrl || runtimeDatabaseUrl !== designatedDatabaseUrl) {
    return false;
  }

  return designatedDatabaseName(designatedDatabaseUrl) !== null;
}

export function getGlobalReportingDemoAdminUserIds(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] {
  const configured = environment[GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS_ENV];
  if (!configured) return [];

  const values = configured.split(",").map((value) => value.trim());
  if (values.some((value) => !uuidSchema.safeParse(value).success)) return [];
  return [...new Set(values.map((value) => value.toLowerCase()))];
}

export function isGlobalReportingDemoAdminConfigured(
  userId: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (!isGlobalReportingDemoDeploymentEnabled(environment)) return false;
  const parsedUserId = uuidSchema.safeParse(userId);
  if (!parsedUserId.success) return false;
  return getGlobalReportingDemoAdminUserIds(environment).includes(parsedUserId.data.toLowerCase());
}

export function getDesignatedGlobalReportingDatabaseName(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  if (!isGlobalReportingDemoDeploymentEnabled(environment)) return null;
  return designatedDatabaseName(environment[GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL_ENV]);
}
