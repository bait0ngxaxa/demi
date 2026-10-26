import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

import setup from "./database-isolation.global-setup";

it("refuses an unmarked database without truncating existing fixture data", async () => {
  // The global setup has already verified this disposable instance before this module loads.
  const prisma = new PrismaClient();
  const person = await prisma.person.create({
    data: { identityKeyHash: `reset-guard-${randomUUID()}` },
    select: { id: true },
  });
  try {
    await prisma.$executeRaw`COMMENT ON DATABASE demi_test IS NULL`;
    await expect(setup()).rejects.toThrow("Compose-provisioned disposable identity");
    const migration = spawnSync(process.execPath, ["scripts/integration.mjs", "migrate"], {
      env: process.env, encoding: "utf8", windowsHide: true,
    });
    expect(migration.status).toBe(1);
    expect(migration.stderr).toContain("Compose-provisioned disposable identity");
    expect(migration.stdout).not.toContain("Prisma schema loaded");
    expect(await prisma.person.count({ where: { id: person.id } })).toBe(1);
  } finally {
    await prisma.$executeRaw`COMMENT ON DATABASE demi_test IS 'DEMI_DISPOSABLE_INTEGRATION_DATABASE_V1'`;
    await prisma.person.delete({ where: { id: person.id } });
    await prisma.$disconnect();
  }
});
