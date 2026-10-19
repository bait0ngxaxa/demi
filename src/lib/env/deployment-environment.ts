import "server-only";

import { z } from "zod";

import { resolveAppointmentLineNotificationRollout } from "@/modules/appointments/domain/appointment-line-notifications";
import {
  getLineMiniAppDeauthorizationCredentials,
  isLineMiniAppDisabled,
  resolveLineMiniAppChannel,
} from "@/modules/line/services/line-mini-app-configuration";
import { parseLineWorkflowContextKeyring } from "@/modules/line/services/line-workflow-context";
import { resolveNotificationSchedulerSecret } from "@/modules/notification-scheduler/services/notification-scheduler-auth";
import { REPORT_CURSOR_SECRET_MIN_BYTES } from "@/modules/reporting/services/hospital-report-query-service";

import {
  getApplicationPublicOrigin,
  isMedicationLineRemindersDisabled,
  lineLiffIdEnvSchema,
  lineLoginEnvSchema,
  lineMessagingEnvSchema,
  patientEvidenceStorageEnvSchema,
  serverEnvSchema,
  supabaseAdminEnvSchema,
} from "./server";

/**
 * Deployment configuration check shared by `npm run env:check` and the
 * readiness probe. It evaluates `process.env` with the same schemas and
 * resolvers the runtime uses and reports variable names and statuses only,
 * never values.
 */

export type DeploymentVariableGroup = "CORE" | "PRODUCTION" | "OPTIONAL" | "FEATURE";
export type DeploymentVariableStatus = "OK" | "PLACEHOLDER" | "UNSET" | "MISSING" | "INVALID";
export type DeploymentEnvironmentProfile = "runtime" | "production";

export type DeploymentEnvironmentReport = {
  readonly variables: ReadonlyArray<{ name: string; group: DeploymentVariableGroup; status: DeploymentVariableStatus }>;
  readonly features: Readonly<Record<string, boolean>>;
  /** No MISSING or INVALID variable in the checked groups. */
  readonly valid: boolean;
  readonly placeholders: readonly string[];
};

const GROUPS: Readonly<Record<DeploymentVariableGroup, readonly string[]>> = {
  CORE: [
    "NODE_ENV",
    "DATABASE_URL",
    "DIRECT_URL",
    "IDENTITY_HASH_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_PATIENT_EVIDENCE_BUCKET",
    "DEMI_HOSPITAL_REPORTING_CURSOR_SECRET",
    "DEMI_LINE_PUBLIC_ORIGIN",
  ],
  PRODUCTION: [
    "DEMI_DEPLOYMENT_STAGE",
    "DEMI_LINE_LOGIN_CHANNEL_ID",
    "NEXT_PUBLIC_DEMI_LINE_LIFF_ID",
    "DEMI_LINE_MESSAGING_CHANNEL_SECRET",
    "DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN",
    "DEMI_LINE_MESSAGING_BOT_USER_ID",
    "DEMI_SCHEDULER_SECRET",
  ],
  OPTIONAL: [
    "DEMI_ALLOW_TEST_NATIONAL_IDS",
    "DEMI_LINE_LOGIN_CHANNEL_SECRET",
    "DEMI_LINE_MEDICATION_REMINDERS_WORKER_SECRET",
    "DEMI_LINE_APPOINTMENT_NOTIFICATIONS_WORKER_SECRET",
    "CRON_SECRET",
    "DEMI_LINE_MINI_APP_ENVIRONMENT",
    "DEMI_LINE_MINI_APP_CHANNEL_ID",
    "DEMI_LINE_MINI_APP_LIFF_ID",
    "DEMI_LINE_MINI_APP_CHANNEL_SECRET",
    "DEMI_LINE_MINI_APP_CONTEXT_KEYRING",
  ],
  FEATURE: [
    "DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED",
    "DEMI_LINE_APPOINTMENT_NOTIFICATIONS_GENERATION",
    "DEMI_LINE_MEDICATION_REMINDERS_DISABLED",
    "DEMI_LINE_MINI_APP_DISABLED",
    "FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED",
  ],
};

/** Every variable the server reads at runtime (tests-only variables excluded). */
export const DEPLOYMENT_ENVIRONMENT_VARIABLES: readonly string[] = Object.values(GROUPS).flat();

const MINI_VARIABLES = GROUPS.OPTIONAL.filter((name) => name.startsWith("DEMI_LINE_MINI_APP_"));
// Same bound as the HMAC worker and scheduler secret schemas.
const workerSecretSchema = z.string().min(32).max(1024);
const optionalBooleanSchema = z.enum(["true", "false"]).optional();

/** Example-file convention: a value containing "placeholder", or an all-zero ID. */
export function isPlaceholderValue(value: string): boolean {
  return /placeholder/iu.test(value) || /^(?:U?0{4,}|0{4,}-.*)$/u.test(value);
}

function read(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
}

function schemaFailures(schema: z.ZodType, names: readonly string[]): string[] {
  const result = schema.safeParse(Object.fromEntries(names.map((name) => [name, process.env[name]])));
  return result.success ? [] : [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
}

function succeeds(operation: () => unknown): boolean {
  try {
    operation();
    return true;
  } catch {
    return false;
  }
}

function invalidCore(): string[] {
  return [
    ...schemaFailures(serverEnvSchema, ["NODE_ENV", "DATABASE_URL", "DIRECT_URL", "IDENTITY_HASH_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
    ...schemaFailures(supabaseAdminEnvSchema, ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]),
    ...schemaFailures(patientEvidenceStorageEnvSchema, ["SUPABASE_PATIENT_EVIDENCE_BUCKET"]),
    ...(Buffer.byteLength(read("DEMI_HOSPITAL_REPORTING_CURSOR_SECRET") ?? "", "utf8") < REPORT_CURSOR_SECRET_MIN_BYTES
      ? ["DEMI_HOSPITAL_REPORTING_CURSOR_SECRET"]
      : []),
    ...(succeeds(getApplicationPublicOrigin) ? [] : ["DEMI_LINE_PUBLIC_ORIGIN"]),
  ];
}

function invalidProduction(): string[] {
  return [
    ...(process.env.NODE_ENV === "production" ? [] : ["NODE_ENV"]),
    ...(process.env.DEMI_DEPLOYMENT_STAGE === "production" ? [] : ["DEMI_DEPLOYMENT_STAGE"]),
    ...schemaFailures(lineLoginEnvSchema, ["DEMI_LINE_LOGIN_CHANNEL_ID", "DEMI_LINE_PUBLIC_ORIGIN", "IDENTITY_HASH_SECRET"]),
    ...(lineLiffIdEnvSchema.safeParse(process.env.NEXT_PUBLIC_DEMI_LINE_LIFF_ID).success ? [] : ["NEXT_PUBLIC_DEMI_LINE_LIFF_ID"]),
    ...schemaFailures(lineMessagingEnvSchema, GROUPS.PRODUCTION.filter((name) => name.startsWith("DEMI_LINE_MESSAGING_"))),
    // The VPS timer sends DEMI_SCHEDULER_SECRET; the CRON_SECRET fallback is for Vercel Cron only.
    ...(read("DEMI_SCHEDULER_SECRET") !== undefined && resolveNotificationSchedulerSecret() !== null ? [] : ["DEMI_SCHEDULER_SECRET"]),
  ];
}

function invalidOptional(): string[] {
  const invalid: string[] = [];
  // Ignored in the production stage anyway; "true" there signals a copied non-production file.
  const testNationalIds = read("DEMI_ALLOW_TEST_NATIONAL_IDS");
  if (!optionalBooleanSchema.safeParse(testNationalIds).success || testNationalIds === "true") {
    invalid.push("DEMI_ALLOW_TEST_NATIONAL_IDS");
  }
  for (const name of ["DEMI_LINE_MEDICATION_REMINDERS_WORKER_SECRET", "DEMI_LINE_APPOINTMENT_NOTIFICATIONS_WORKER_SECRET", "CRON_SECRET"]) {
    const value = read(name);
    if (value !== undefined && !workerSecretSchema.safeParse(value).success) invalid.push(name);
  }
  if (MINI_VARIABLES.some((name) => read(name) !== undefined)) {
    if (!succeeds(resolveLineMiniAppChannel)) {
      invalid.push("DEMI_LINE_MINI_APP_ENVIRONMENT", "DEMI_LINE_MINI_APP_CHANNEL_ID", "DEMI_LINE_MINI_APP_LIFF_ID");
    }
    if (!succeeds(() => parseLineWorkflowContextKeyring(process.env.DEMI_LINE_MINI_APP_CONTEXT_KEYRING))) {
      invalid.push("DEMI_LINE_MINI_APP_CONTEXT_KEYRING");
    }
    if (read("DEMI_LINE_MINI_APP_CHANNEL_SECRET") !== undefined && !succeeds(getLineMiniAppDeauthorizationCredentials)) {
      invalid.push("DEMI_LINE_MINI_APP_CHANNEL_SECRET");
    }
  }
  return invalid;
}

function invalidFeatures(): string[] {
  const invalid: string[] = [];
  const enabled = read("DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED");
  if (!optionalBooleanSchema.safeParse(enabled).success) invalid.push("DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED");
  // ENABLED=true with an unusable GENERATION silently stays off at runtime; surface the mismatch here.
  if (enabled === "true" && !resolveAppointmentLineNotificationRollout({ enabled, generation: process.env.DEMI_LINE_APPOINTMENT_NOTIFICATIONS_GENERATION }).enabled) {
    invalid.push("DEMI_LINE_APPOINTMENT_NOTIFICATIONS_GENERATION");
  }
  if (!optionalBooleanSchema.safeParse(read("FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED")).success) {
    invalid.push("FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED");
  }
  return invalid;
}

export function checkDeploymentEnvironment(profile: DeploymentEnvironmentProfile): DeploymentEnvironmentReport {
  const checked: DeploymentVariableGroup[] = profile === "production" ? ["CORE", "PRODUCTION", "OPTIONAL", "FEATURE"] : ["CORE"];
  const invalid = new Set([
    ...invalidCore(),
    ...(profile === "production" ? [...invalidProduction(), ...invalidOptional(), ...invalidFeatures()] : []),
  ]);
  const required = new Set<DeploymentVariableGroup>(["CORE", "PRODUCTION"]);
  const variables = checked.flatMap((group) => GROUPS[group].map((name) => {
    const value = read(name);
    let status: DeploymentVariableStatus;
    if (value === undefined && !invalid.has(name)) status = "UNSET";
    else if (value === undefined) status = required.has(group) ? "MISSING" : "INVALID";
    else if (invalid.has(name)) status = "INVALID";
    else status = isPlaceholderValue(value) ? "PLACEHOLDER" : "OK";
    return { name, group, status };
  }));
  const rollout = resolveAppointmentLineNotificationRollout({
    enabled: process.env.DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED,
    generation: process.env.DEMI_LINE_APPOINTMENT_NOTIFICATIONS_GENERATION,
  });
  return {
    variables,
    features: {
      appointmentNotifications: rollout.enabled,
      medicationReminders: !isMedicationLineRemindersDisabled(),
      miniAppProvisioned: MINI_VARIABLES.some((name) => read(name) !== undefined),
      miniAppKillSwitch: isLineMiniAppDisabled(),
      familyDelegatedAppointmentRead: process.env.FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED === "true",
    },
    valid: variables.every(({ status }) => status !== "MISSING" && status !== "INVALID"),
    placeholders: variables.filter(({ status }) => status === "PLACEHOLDER").map(({ name }) => name),
  };
}
