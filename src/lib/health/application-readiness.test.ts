import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { getApplicationReadiness } from "./application-readiness";

type Row = { migration_name: string; finished: boolean; rolled_back: boolean };
const applied = (...names: string[]): Row[] => names.map((migration_name) => ({ migration_name, finished: true, rolled_back: false }));

function database(input: { ping?: () => Promise<unknown>; rows?: () => Promise<Row[]> } = {}): () => PrismaClient {
  const queryRaw = vi.fn((strings: TemplateStringsArray) =>
    strings.join("").includes("_prisma_migrations")
      ? (input.rows ?? (async () => applied("m1", "m2")))()
      : (input.ping ?? (async () => [{ "?column?": 1 }]))());
  return () => ({ $queryRaw: queryRaw }) as unknown as PrismaClient;
}

const shipped = async () => ["m1", "m2"];
const ready = { database: true, migrations: true, configuration: true };

describe("application readiness", () => {
  it("is ready when the database answers, every shipped migration is applied and configuration is valid", async () => {
    await expect(getApplicationReadiness({ database: database(), listMigrations: shipped, configurationValid: () => true }))
      .resolves.toEqual({ ready: true, checks: ready });
  });

  it("is not ready when configuration is invalid", async () => {
    await expect(getApplicationReadiness({ database: database(), listMigrations: shipped, configurationValid: () => false }))
      .resolves.toEqual({ ready: false, checks: { ...ready, configuration: false } });
  });

  it("is not ready when the database client cannot be created", async () => {
    const failing = () => { throw new Error("Server environment is not configured correctly"); };
    await expect(getApplicationReadiness({ database: failing, listMigrations: shipped, configurationValid: () => true }))
      .resolves.toEqual({ ready: false, checks: { database: false, migrations: false, configuration: true } });
  });

  it("is not ready when the database is unreachable or does not answer in time", async () => {
    const unreachable = database({ ping: async () => { throw new Error("connect ECONNREFUSED 10.0.0.1:5432"); } });
    await expect(getApplicationReadiness({ database: unreachable, listMigrations: shipped, configurationValid: () => true }))
      .resolves.toEqual({ ready: false, checks: { database: false, migrations: false, configuration: true } });
    const hanging = database({ ping: () => new Promise(() => undefined) });
    await expect(getApplicationReadiness({ database: hanging, listMigrations: shipped, configurationValid: () => true, timeoutMs: 10 }))
      .resolves.toMatchObject({ ready: false, checks: { database: false } });
  });

  it.each([
    ["a shipped migration is not applied", async () => applied("m1")],
    ["a migration failed", async () => [...applied("m1"), { migration_name: "m2", finished: false, rolled_back: false }]],
    ["the only record of a migration was rolled back", async () => [...applied("m1"), { migration_name: "m2", finished: true, rolled_back: true }]],
    ["the migrations table is missing", async () => { throw new Error('relation "_prisma_migrations" does not exist'); }],
  ])("is not ready when %s", async (_case, rows) => {
    await expect(getApplicationReadiness({ database: database({ rows }), listMigrations: shipped, configurationValid: () => true }))
      .resolves.toEqual({ ready: false, checks: { ...ready, migrations: false } });
  });

  it("stays ready after a failed attempt was rolled back and re-applied", async () => {
    const rows = async () => [...applied("m1", "m2"), { migration_name: "m2", finished: false, rolled_back: true }];
    await expect(getApplicationReadiness({ database: database({ rows }), listMigrations: shipped, configurationValid: () => true }))
      .resolves.toMatchObject({ ready: true });
  });

  it("is not ready when the shipped migrations cannot be listed", async () => {
    const unlisted = async () => { throw new Error("ENOENT"); };
    await expect(getApplicationReadiness({ database: database(), listMigrations: unlisted, configurationValid: () => true }))
      .resolves.toMatchObject({ ready: false, checks: { migrations: false } });
    await expect(getApplicationReadiness({ database: database(), listMigrations: async () => [], configurationValid: () => true }))
      .resolves.toMatchObject({ ready: false, checks: { migrations: false } });
  });

  it("finds this repository's migrations by default", async () => {
    const rows = async () => applied(...(await import("node:fs")).readdirSync("prisma/migrations", { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    await expect(getApplicationReadiness({ database: database({ rows }), configurationValid: () => true }))
      .resolves.toMatchObject({ ready: true });
  });
});
