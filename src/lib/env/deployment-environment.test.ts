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

  it("does not require deployment labels or optional providers for a production check", () => {
    const report = checkDeploymentEnvironment("production");
    expect(report.valid).toBe(true);
    expect(status(report, "DEMI_LINE_MESSAGING_CHANNEL_SECRET")).toBe("UNSET");
    expect(status(report, "DEMI_SCHEDULER_SECRET")).toBe("UNSET");
    expect(report.variables.some(({ name }) => name === "DEMI_DEPLOYMENT_STAGE")).toBe(false);
  });

  it("allows the explicit National ID test override in production mode", () => {
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");

    const report = checkDeploymentEnvironment("production");
    expect(report.valid).toBe(true);
    expect(status(report, "DEMI_ALLOW_TEST_NATIONAL_IDS")).toBe("OK");
  });

  it.each(["false", "yes", "TRUE"]) ("reports invalid National ID test flag %j", (value) => {
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", value);

    const report = checkDeploymentEnvironment("production");
    expect(report.valid).toBe(value === "false");
    expect(status(report, "DEMI_ALLOW_TEST_NATIONAL_IDS")).toBe(value === "false" ? "OK" : "INVALID");
  });

  it("validates a provisioned LINE Messaging integration as a complete configuration", () => {
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_SECRET", "channel-secret");

    const incomplete = checkDeploymentEnvironment("production");
    expect(incomplete.valid).toBe(false);
    expect(status(incomplete, "DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN")).toBe("INVALID");
    expect(status(incomplete, "DEMI_LINE_MESSAGING_BOT_USER_ID")).toBe("INVALID");

    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "access-token");
    vi.stubEnv("DEMI_LINE_MESSAGING_BOT_USER_ID", "U1234567890abcdef1234567890abcdef");
    expect(checkDeploymentEnvironment("production").valid).toBe(true);
  });

  it("rejects a partially configured LINE MINI App without requiring an unconfigured one", () => {
    vi.stubEnv("DEMI_LINE_MINI_APP_CHANNEL_ID", "2234567890");
    const report = checkDeploymentEnvironment("production");
    expect(report.valid).toBe(false);
    expect(status(report, "DEMI_LINE_MINI_APP_ENVIRONMENT")).toBe("INVALID");
    expect(status(report, "DEMI_LINE_MINI_APP_CONTEXT_KEYRING")).toBe("INVALID");
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
