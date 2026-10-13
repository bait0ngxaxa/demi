import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";

const database = getPrisma();
const migrationNames = [
  "20261015100000_workforce_remediation",
  "20261015110000_workforce_activation_context",
  "20261015120000_workforce_activation_operation_state",
  "20261015130000_workforce_state_constraints",
];

function statements(name: string): string[] {
  const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
  return sql.replace(/^--.*$/gmu, "").split(";").map((statement) => statement.trim()).filter(Boolean);
}

describe("workforce forward migration on populated legacy credentials", () => {
  afterAll(async () => { await database.$disconnect(); });

  it("preserves hashes and consumed history, revokes unbound credentials and quarantines ambiguous claims", async () => {
    await database.$transaction(async (transaction) => {
      // A session-local legacy table shadows the real table; production/application data is never touched.
      await transaction.$executeRawUnsafe('CREATE TEMP TABLE "Hospital" ("id" UUID PRIMARY KEY) ON COMMIT DROP');
      await transaction.$executeRawUnsafe(`CREATE TEMP TABLE "WorkforceActivation" (
        "id" UUID PRIMARY KEY, "tokenHash" VARCHAR(64) NOT NULL, "purpose" "WorkforceActivationPurpose" NOT NULL,
        "claimedAt" TIMESTAMP(3), "usedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ON COMMIT DROP`);
      const now = new Date();
      const ids = Array.from({ length: 4 }, () => randomUUID());
      const hashes = ["a", "b", "c", "d"].map((value) => value.repeat(64));
      for (const [index, id] of ids.entries()) {
        await transaction.$executeRaw(Prisma.sql`INSERT INTO "WorkforceActivation" ("id", "tokenHash", "purpose", "claimedAt", "usedAt")
          VALUES (${id}::uuid, ${hashes[index]}, ${index < 2 ? "RESET" : "ACTIVATION"}::"WorkforceActivationPurpose", ${index === 1 ? now : null}, ${index === 2 ? now : null})`);
      }
      for (const name of migrationNames) {
        for (const statement of statements(name)) {
          // Bulk tables and the enum already exist in this migrated integration database.
          if (name === migrationNames[0] && !statement.startsWith('UPDATE "WorkforceActivation"')) continue;
          if (statement.startsWith("CREATE TYPE")) continue;
          await transaction.$executeRawUnsafe(statement);
        }
      }
      const rows = await transaction.$queryRaw<{ id: string; tokenHash: string; claimedAt: Date | null; usedAt: Date | null; revokedAt: Date | null; operationState: string; reconciliationRequiredAt: Date | null }[]>(Prisma.sql`
        SELECT "id", "tokenHash", "claimedAt", "usedAt", "revokedAt", "operationState", "reconciliationRequiredAt" FROM "WorkforceActivation"`);
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(ids[0])).toMatchObject({ tokenHash: hashes[0], operationState: "NOT_STARTED", revokedAt: expect.any(Date), claimedAt: null });
      expect(byId.get(ids[1])).toMatchObject({ tokenHash: hashes[1], operationState: "RECONCILIATION_REQUIRED", revokedAt: expect.any(Date), claimedAt: now, reconciliationRequiredAt: expect.any(Date) });
      expect(byId.get(ids[2])).toMatchObject({ tokenHash: hashes[2], operationState: "FINALIZED", usedAt: now, revokedAt: null });
      expect(byId.get(ids[3])).toMatchObject({ tokenHash: hashes[3], operationState: "NOT_STARTED", revokedAt: expect.any(Date), usedAt: null });
      await transaction.$executeRawUnsafe("SAVEPOINT invalid_context");
      await expect(transaction.$executeRaw(Prisma.sql`UPDATE "WorkforceActivation" SET "relationshipId" = ${randomUUID()}::uuid WHERE "id" = ${ids[3]}::uuid`)).rejects.toBeDefined();
      await transaction.$executeRawUnsafe("ROLLBACK TO SAVEPOINT invalid_context");
      await expect(transaction.$executeRaw(Prisma.sql`UPDATE "WorkforceActivation" SET "operationState" = 'PROVIDER_CONFIRMED' WHERE "id" = ${ids[3]}::uuid`)).rejects.toBeDefined();
      await transaction.$executeRawUnsafe("ROLLBACK TO SAVEPOINT invalid_context");
    });
  });
  it("revokes legacy Patient recovery while retaining ambiguous claims and hashes", async () => {
    await database.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(`CREATE TEMP TABLE "AccountRecovery" (
        "tokenHash" VARCHAR(64) PRIMARY KEY, "claimedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
        "revokedAt" TIMESTAMP(3), "reconciliationRequiredAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3)
      ) ON COMMIT DROP`);
      const now = new Date();
      await transaction.$executeRaw(Prisma.sql`INSERT INTO "AccountRecovery" ("tokenHash", "claimedAt", "completedAt") VALUES (${"a".repeat(64)}, NULL, NULL), (${"b".repeat(64)}, ${now}, NULL), (${"c".repeat(64)}, ${now}, ${now})`);
      for (const sql of statements("20261015140000_global_assisted_recovery_gate")) await transaction.$executeRawUnsafe(sql);
      const rows = await transaction.$queryRaw<{ tokenHash: string; claimedAt: Date | null; completedAt: Date | null; revokedAt: Date | null; reconciliationRequiredAt: Date | null }[]>(Prisma.sql`SELECT "tokenHash", "claimedAt", "completedAt", "revokedAt", "reconciliationRequiredAt" FROM "AccountRecovery" ORDER BY "tokenHash"`);
      expect(rows[0]).toMatchObject({ tokenHash: "a".repeat(64), claimedAt: null, revokedAt: expect.any(Date), reconciliationRequiredAt: null });
      expect(rows[1]).toMatchObject({ tokenHash: "b".repeat(64), claimedAt: now, revokedAt: expect.any(Date), reconciliationRequiredAt: expect.any(Date) });
      expect(rows[2]).toMatchObject({ tokenHash: "c".repeat(64), completedAt: now, revokedAt: null });
    });
  });

});
