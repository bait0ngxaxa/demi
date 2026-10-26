import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import setup from "../tests/integration/database-isolation.global-setup";
import config from "../vitest.integration.config.mts";
import { assertDisposableIntegrationEnvironment } from "./integration-environment.mjs";

const { database, construct } = vi.hoisted(() => {
  const database = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    appointmentLineNotificationWorkerState: { upsert: vi.fn().mockResolvedValue({}) },
    medicationLineReminderWorkerState: { upsert: vi.fn().mockResolvedValue({}) },
    notificationSchedulerState: { upsert: vi.fn().mockResolvedValue({}) },
  };
  return { database, construct: vi.fn(function () { return database; }) };
});

vi.mock("@prisma/client", () => ({ PrismaClient: construct }));

const url = "postgresql://demi_test:demi_test_password@127.0.0.1:55432/demi_test";
const environment = { NODE_ENV: "test", DATABASE_URL: url, DIRECT_URL: url, DEMI_TEST_DATABASE_URL: url };
const identity = {
  database: "demi_test", username: "demi_test", schema: "public", marker: "DEMI_DISPOSABLE_INTEGRATION_DATABASE_V1",
};

describe("integration reset safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
    vi.stubEnv("VERCEL_ENV", "development");
    database.$transaction.mockImplementation(async (callback) => callback(database));
    database.$queryRaw.mockResolvedValue([identity]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["DATABASE_URL", "DIRECT_URL", "DEMI_TEST_DATABASE_URL"])("refuses absent or mismatched %s before creating a client", async (name) => {
    for (const value of [undefined, "postgresql://dev:secret@localhost:5432/dev"]) {
      vi.stubEnv(name, value);
      await expect(setup()).rejects.toThrow(name);
    }
    expect(construct).not.toHaveBeenCalled();
    expect(database.$executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    "postgresql://dev:secret@localhost:5432/dev",
    url.replace("55432", "5432"),
    url.replace("127.0.0.1", "remote.example.com"),
    url.replace("demi_test_password", "secret"),
    url.replace("postgresql:", "https:"),
    `${url}?schema=other`,
    `${url}#public`,
    "not-a-url",
  ])("refuses an unapproved target even when all three URLs agree (%#)", async (target) => {
    for (const name of ["DATABASE_URL", "DIRECT_URL", "DEMI_TEST_DATABASE_URL"]) vi.stubEnv(name, target);
    await expect(setup()).rejects.toThrow("committed disposable integration target");
    expect(construct).not.toHaveBeenCalled();
  });

  it.each([["NODE_ENV", "production"], ["NODE_ENV", "development"], ["VERCEL_ENV", "production"]])("refuses unsafe %s before database access", async (name, value) => {
    vi.stubEnv(name, value);
    await expect(setup()).rejects.toThrow("nonproduction environment");
    expect(construct).not.toHaveBeenCalled();
  });

  it.each([
    [],
    [{ ...identity, marker: null }],
    [{ ...identity, marker: "ordinary-development-database" }],
    [{ ...identity, database: "dev" }],
    [{ ...identity, username: "postgres" }],
    [{ ...identity, schema: "other" }],
  ].map((targets) => ({ targets })))("refuses unprovisioned or forwarded database identity before truncation (%#)", async ({ targets }) => {
    database.$queryRaw.mockResolvedValue(targets);
    await expect(setup()).rejects.toThrow("Compose-provisioned disposable identity");
    expect(database.$executeRaw).not.toHaveBeenCalled();
    expect(database.notificationSchedulerState.upsert).not.toHaveBeenCalled();
    expect(database.$disconnect).toHaveBeenCalledOnce();
  });

  it("registers initialization once per run, without reset side effects on module import", async () => {
    expect(config.test.globalSetup).toEqual(["./tests/integration/database-isolation.global-setup.ts"]);
    expect(config.test.setupFiles).toEqual(["./vitest.setup.ts"]);
    await import("../tests/integration/database-isolation.global-setup");
    expect(construct).not.toHaveBeenCalled();
  });

  it("initializes only the approved, provisioned database and restores singleton state", async () => {
    expect(assertDisposableIntegrationEnvironment(environment)).toBe(url);
    await setup();
    expect(database.$queryRaw).toHaveBeenCalledOnce();
    expect(database.$executeRaw).toHaveBeenCalledOnce();
    expect(database.appointmentLineNotificationWorkerState.upsert).toHaveBeenCalledOnce();
    expect(database.medicationLineReminderWorkerState.upsert).toHaveBeenCalledOnce();
    expect(database.notificationSchedulerState.upsert).toHaveBeenCalledOnce();
    expect(database.$disconnect).toHaveBeenCalledOnce();
  });

  it("the runner rejects unapproved URLs before migration or Vitest, without exposing credentials", () => {
    const target = "postgresql://dev:do-not-print-this@127.0.0.1:55432/dev";
    const result = spawnSync(process.execPath, ["scripts/integration.mjs", "test"], {
      env: { ...process.env, ...environment, DATABASE_URL: target, DIRECT_URL: target, DEMI_TEST_DATABASE_URL: target },
      encoding: "utf8",
      windowsHide: true,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("committed disposable integration target");
    expect(result.stderr).not.toContain("do-not-print-this");
    expect(result.stdout).not.toContain("Prisma");
  });

  it("the runner never overwrites an inherited production marker with the test env file", () => {
    const inherited = { ...process.env, NODE_ENV: "production" };
    for (const name of ["DATABASE_URL", "DIRECT_URL", "DEMI_TEST_DATABASE_URL"]) delete inherited[name];
    const result = spawnSync(process.execPath, ["scripts/integration.mjs", "test"], {
      env: inherited, encoding: "utf8", windowsHide: true,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("refuse a production environment");
    expect(result.stdout).not.toContain("Prisma");
  });

  it("direct Vitest invocation also fails closed before integration test modules load", () => {
    const target = url.replace("postgresql:", "https:");
    const result = spawnSync(process.execPath, [
      "node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.mts",
      "tests/integration/foundation.integration.test.ts",
    ], {
      env: { ...process.env, ...environment, DATABASE_URL: target, DIRECT_URL: target, DEMI_TEST_DATABASE_URL: target },
      encoding: "utf8", windowsHide: true,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("committed disposable integration target");
    expect(result.stdout).not.toContain("tests/integration/foundation.integration.test.ts (");
  });
});
