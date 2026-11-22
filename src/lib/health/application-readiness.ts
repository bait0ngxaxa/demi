import "server-only";

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { checkDeploymentEnvironment } from "@/lib/env/deployment-environment";

export const APPLICATION_READINESS_TIMEOUT_MS = 5_000;

/**
 * Booleans only: no versions, names, counts or error detail leave this module. `jitOff` is advisory and never part of
 * `ready`: with JIT on, the care-tracking read pays ~2 s of compilation per request (docs/engineering/
 * CARE_TRACKING_PERF.md), but the application still works, and taking it out of service would not fix a database
 * setting. The deploy runbook requires it to be true.
 */
export type ApplicationReadiness = {
  readonly ready: boolean;
  readonly checks: {
    readonly database: boolean;
    readonly migrations: boolean;
    readonly configuration: boolean;
    readonly jitOff: boolean;
  };
};

export type ApplicationReadinessDependencies = {
  readonly database?: () => PrismaClient;
  readonly listMigrations?: () => Promise<readonly string[]>;
  readonly configurationValid?: () => boolean;
  readonly timeoutMs?: number;
};

type MigrationRow = { migration_name: string; finished: boolean; rolled_back: boolean };

type JitSettingRow = { jit: string };

/** Migration directories shipped with this build (traced for /api/health in next.config.ts). */
async function listShippedMigrations(): Promise<string[]> {
  const entries = await readdir(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("readiness timeout")), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

async function settles(operation: () => Promise<boolean>): Promise<boolean> {
  try {
    return await operation();
  } catch {
    return false;
  }
}

export async function getApplicationReadiness(dependencies: ApplicationReadinessDependencies = {}): Promise<ApplicationReadiness> {
  const configuration = (() => {
    try {
      return (dependencies.configurationValid ?? (() => checkDeploymentEnvironment("runtime").valid))();
    } catch {
      return false;
    }
  })();
  const timeoutMs = dependencies.timeoutMs ?? APPLICATION_READINESS_TIMEOUT_MS;
  let prisma: PrismaClient | null;
  try {
    // Throws when the core database configuration is invalid.
    prisma = (dependencies.database ?? getPrisma)();
  } catch {
    prisma = null;
  }
  const database = prisma !== null && await settles(async () => {
    await withTimeout(prisma.$queryRaw`SELECT 1`, timeoutMs);
    return true;
  });
  const migrations = prisma !== null && database && await settles(async () => {
    const applied = await withTimeout(prisma.$queryRaw<MigrationRow[]>`
      SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
      FROM "_prisma_migrations"`, timeoutMs);
    // A started-but-unfinished, not rolled back row is a failed or still running migration.
    if (applied.some((row) => !row.finished && !row.rolled_back)) return false;
    const finished = new Set(applied.filter((row) => row.finished && !row.rolled_back).map((row) => row.migration_name));
    const shipped = await (dependencies.listMigrations ?? listShippedMigrations)();
    return shipped.length > 0 && shipped.every((name) => finished.has(name));
  });
  // The setting as the application role sees it, including any role or database override.
  const jitOff = prisma !== null && database && await settles(async () => {
    const rows = await withTimeout(prisma.$queryRaw<JitSettingRow[]>`SELECT current_setting('jit') AS jit`, timeoutMs);
    return rows[0]?.jit === "off";
  });
  return { ready: configuration && database && migrations, checks: { database, migrations, configuration, jitOff } };
}
