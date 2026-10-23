import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkDeploymentEnvironment, DEPLOYMENT_ENVIRONMENT_VARIABLES, isPlaceholderValue } from "./deployment-environment";

const core = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db.example.org:5432/postgres",
  DIRECT_URL: "postgresql://user:pass@db.example.org:5432/postgres",
  IDENTITY_HASH_SECRET: "i".repeat(40),
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_PATIENT_EVIDENCE_BUCKET: "patient-evidence",
  DEMI_HOSPITAL_REPORTING_CURSOR_SECRET: "r".repeat(32),
  DEMI_LINE_PUBLIC_ORIGIN: "https://demi.example.org",
};

const status = (report: ReturnType<typeof checkDeploymentEnvironment>, name: string) =>
  report.variables.find((variable) => variable.name === name)?.status;

describe("deployment environment check", () => {
  beforeEach(() => {
    for (const name of DEPLOYMENT_ENVIRONMENT_VARIABLES) vi.stubEnv(name, undefined);
    for (const [name, value] of Object.entries(core)) vi.stubEnv(name, value);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the runtime core and checks only that group for readiness", () => {
    const report = checkDeploymentEnvironment("runtime");
    expect(report.valid).toBe(true);
    expect(new Set(report.variables.map(({ group }) => group))).toEqual(new Set(["CORE"]));
  });

  it.each([
    ["DATABASE_URL", "mysql://user:pass@db.example.org/x"],
    ["IDENTITY_HASH_SECRET", "too-short"],
    ["DEMI_HOSPITAL_REPORTING_CURSOR_SECRET", "r".repeat(31)],
    ["DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org/"],
    ["NODE_ENV", "staging"],
    ["SUPABASE_SERVICE_ROLE_KEY", "anon-key"],
  ])("reports %s as invalid without exposing its value", (name, value) => {
    vi.stubEnv(name, value);
    const report = checkDeploymentEnvironment("runtime");
    expect(report.valid).toBe(false);
    expect(status(report, name)).toBe("INVALID");
    expect(JSON.stringify(report)).not.toContain(value);
  });

  it("reports a missing core variable as MISSING", () => {
    vi.stubEnv("SUPABASE_PATIENT_EVIDENCE_BUCKET", "");
    const report = checkDeploymentEnvironment("runtime");
    expect(report.valid).toBe(false);
    expect(status(report, "SUPABASE_PATIENT_EVIDENCE_BUCKET")).toBe("MISSING");
  });

  it("requires production LINE, stage and a dedicated scheduler secret in the production profile", () => {
    vi.stubEnv("CRON_SECRET", "c".repeat(40));
    const report = checkDeploymentEnvironment("production");
    expect(report.valid).toBe(false);
    for (const name of ["DEMI_DEPLOYMENT_STAGE", "DEMI_LINE_LOGIN_CHANNEL_ID", "NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "DEMI_LINE_MESSAGING_BOT_USER_ID", "DEMI_SCHEDULER_SECRET"]) {
      expect(status(report, name)).toBe("MISSING");
    }
  });

  it("derives feature states with the runtime resolvers", () => {
    vi.stubEnv("DEMI_LINE_MEDICATION_REMINDERS_DISABLED", "true");
    vi.stubEnv("DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("DEMI_LINE_APPOINTMENT_NOTIFICATIONS_GENERATION", "1b4e28ba-2fa1-41d2-883f-0016d3cca427");
    expect(checkDeploymentEnvironment("production").features).toEqual({
      appointmentNotifications: true,
      medicationReminders: false,
      miniAppProvisioned: false,
      miniAppKillSwitch: false,
      familyDelegatedAppointmentRead: false,
      familyPlanMedicationSharing: false,
    });
  });

  it("reports the AF-5 plan/medication sharing gate and rejects a non-boolean value", () => {
    vi.stubEnv("FAMILY_PLAN_MEDICATION_SHARING_ENABLED", "true");
    expect(checkDeploymentEnvironment("production").features.familyPlanMedicationSharing).toBe(true);
    vi.stubEnv("FAMILY_PLAN_MEDICATION_SHARING_ENABLED", "yes");
    const report = checkDeploymentEnvironment("production");
    expect(status(report, "FAMILY_PLAN_MEDICATION_SHARING_ENABLED")).toBe("INVALID");
    expect(report.features.familyPlanMedicationSharing).toBe(false);
  });

  it("rejects test National IDs in the production profile", () => {
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");
    expect(status(checkDeploymentEnvironment("production"), "DEMI_ALLOW_TEST_NATIONAL_IDS")).toBe("INVALID");
  });

  it.each([
    ["placeholder-secret", true],
    ["https://prod-origin.placeholder.invalid", true],
    ["0000000000", true],
    ["0000000000-placeholder", true],
    ["U00000000000000000000000000000000", true],
    ["0", false],
    ["false", false],
    ["1234567890", false],
  ])("treats %j as placeholder: %s", (value, expected) => {
    expect(isPlaceholderValue(value)).toBe(expected);
  });
});
