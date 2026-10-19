import { readdirSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { getApplicationReadiness } from "@/lib/health/application-readiness";

const database = getPrisma();

describe("application readiness on PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Verified local disposable PostgreSQL required");
    await database.$connect();
  });
  afterAll(async () => { await database.$disconnect(); });

  it("reports the migrated test database as ready against the repository's migration directories", async () => {
    expect(readdirSync("prisma/migrations").length).toBeGreaterThan(0);
    await expect(getApplicationReadiness({ database: () => database, configurationValid: () => true }))
      .resolves.toEqual({ ready: true, checks: { database: true, migrations: true, configuration: true } });
  });

  it("is not ready when the build ships a migration the database has not applied", async () => {
    const shipped = readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    await expect(getApplicationReadiness({ database: () => database, configurationValid: () => true, listMigrations: async () => [...shipped, "99991231000000_not_applied"] }))
      .resolves.toEqual({ ready: false, checks: { database: true, migrations: false, configuration: true } });
  });
});
