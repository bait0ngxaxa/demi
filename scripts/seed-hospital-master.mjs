import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import { createJiti } from "jiti";

const repositoryRoot = resolve(import.meta.dirname, "..");
const seedDataPath = resolve(repositoryRoot, "prisma", "seed", "hospital-master-v2.json");
const categoryNames = [
  "MATCHED",
  "MISSING_HOSPITAL",
  "MISSING_PARENT",
  "PARENT_MISMATCH",
  "NAME_MISMATCH",
  "UNEXPECTED_HOSPITAL",
  "INVALID_HIERARCHY",
];

function fail(message) {
  console.error(`Hospital master reconciliation failed: ${message}`);
  process.exitCode = 1;
}

function loadDotEnv(fileName, override = false) {
  const filePath = resolve(repositoryRoot, fileName);
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || (!override && process.env[match[1]] !== undefined)) continue;
    process.env[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
  }
}

function parseArguments(argumentsList) {
  const allowed = new Set([
    "--apply",
    "--dry-run",
    "--confirm-name-changes",
    "--confirm-parent-changes",
    "--integration",
    "--help",
  ]);
  const unknown = argumentsList.find((argument) => !allowed.has(argument));
  if (unknown) throw new Error(`unknown option ${unknown}`);

  const flags = new Set(argumentsList);
  if (flags.has("--apply") && flags.has("--dry-run")) {
    throw new Error("choose either --apply or --dry-run");
  }
  if (
    !flags.has("--apply") &&
    (flags.has("--confirm-name-changes") || flags.has("--confirm-parent-changes"))
  ) {
    throw new Error("change confirmations require --apply");
  }

  return {
    apply: flags.has("--apply"),
    integration: flags.has("--integration"),
    confirmNameChanges: flags.has("--confirm-name-changes"),
    confirmParentChanges: flags.has("--confirm-parent-changes"),
    help: flags.has("--help"),
  };
}

function validateDatabaseTarget({ apply, integration }) {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl || databaseUrl !== directUrl) {
    throw new Error("DATABASE_URL and DIRECT_URL must both be set to the same PostgreSQL target");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }

  if (integration) {
    if (
      databaseUrl !== process.env.DEMI_TEST_DATABASE_URL ||
      parsedUrl.hostname !== "127.0.0.1" &&
        parsedUrl.hostname !== "localhost" &&
        parsedUrl.hostname !== "::1"
    ) {
      throw new Error("--integration must target the configured local DEMI_TEST_DATABASE_URL");
    }
  }

  if (!apply) return;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("apply is disabled in production environments");
  }
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//u, ""));
  const isLocalHost = ["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname);
  const isSyntheticDatabase = /(?:test|demo|synthetic|local|dev)/iu.test(databaseName);
  if (!isLocalHost || !isSyntheticDatabase) {
    throw new Error("apply is restricted to a local development, test, or synthetic-demo database");
  }
}

function printReport(report, mode) {
  console.log(`Hospital master reconciliation: ${mode}`);
  console.log(
    `Approved source: ${report.approved.total} Hospitals (${report.approved.main} main, ${report.approved.subordinate} subordinate)`,
  );
  console.log(`Database Hospitals: ${report.databaseHospitalCount}`);

  for (const category of categoryNames) {
    const entries = report.categories[category];
    console.log(`${category}: ${entries.length}`);
    for (const entry of entries) {
      const parent = `parent expected=${entry.expectedParentCode ?? "<none>"}, actual=${entry.actualParentCode ?? "<none>"}`;
      const detail = entry.reason ? `; ${entry.reason}` : "";
      console.log(`  ${entry.hospitalCode} [${entry.status ?? "MISSING"}] ${entry.name}; ${parent}${detail}`);
    }
  }

  if (mode === "APPLY") {
    console.log(
      `Applied: created=${report.applied.created.length}, renamed=${report.applied.renamed.length}, reparented=${report.applied.reparented.length}`,
    );
  } else {
    console.log("Dry-run completed without database writes.");
  }
  console.log("Unexpected Hospitals are reported and retained.");
}

function printHelp() {
  console.log(`Usage: node scripts/seed-hospital-master.mjs [--dry-run | --apply] [options]

Default: read-only dry-run.
  --apply                      Apply missing records in a serializable transaction.
  --confirm-name-changes       Required to update existing Hospital names.
  --confirm-parent-changes     Required to update existing parent relationships.
  --integration                Use .env.integration and verify its local test database.
  --help                       Show this message.

Apply is blocked outside a local test, development, or synthetic-demo database.
It never deletes Hospitals or changes status, accounts, memberships, or clinical relationships.`);
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : "invalid command options");
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  if (options.integration) {
    loadDotEnv(".env.integration", true);
  } else {
    loadDotEnv(".env");
    loadDotEnv(".env.local");
  }

  try {
    validateDatabaseTarget(options);
  } catch (error) {
    fail(error instanceof Error ? error.message : "database target is invalid");
    return;
  }

  const source = JSON.parse(readFileSync(seedDataPath, "utf8"));
  const jiti = createJiti(import.meta.url, { alias: { "@": resolve(repositoryRoot, "src") } });
  const { reconcileHospitalMaster } = await jiti.import(
    "../src/modules/hospital-hierarchy/services/hospital-master-reconciliation-service.ts",
  );
  const database = new PrismaClient();

  try {
    const report = await reconcileHospitalMaster(database, source, {
      mode: options.apply ? "apply" : "dry-run",
      confirmNameChanges: options.confirmNameChanges,
      confirmParentChanges: options.confirmParentChanges,
    });
    printReport(report, options.apply ? "APPLY" : "DRY RUN");
    if (report.categories.INVALID_HIERARCHY.length > 0) process.exitCode = 1;
  } catch (error) {
    fail(error instanceof Error ? error.message : "database reconciliation could not be completed");
  } finally {
    await database.$disconnect();
  }
}

await main();
