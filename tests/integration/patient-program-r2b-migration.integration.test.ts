import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";

const prisma = getPrisma();

describe("Phase R2b floating chart migration", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("adds nullable scores to a populated legacy chart table and preserves its summary", async () => {
    const migrationSql = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20261104100000_r2b_floating_chart_scores/migration.sql",
      ),
      "utf8",
    );
    const statements = migrationSql.split(";").map((statement) => statement.trim()).filter(Boolean);

    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        CREATE TEMPORARY TABLE "PatientProgramServiceOneFloatingChart" (
          "id" UUID PRIMARY KEY,
          "patientProgramId" UUID NOT NULL,
          "roundNumber" INTEGER NOT NULL,
          "recordedByUserId" UUID NOT NULL,
          "recordedAt" TIMESTAMPTZ(3) NOT NULL,
          "summary" VARCHAR(2000)
        )
      `;
      await transaction.$executeRaw`
        INSERT INTO "PatientProgramServiceOneFloatingChart" (
          "id", "patientProgramId", "roundNumber", "recordedByUserId", "recordedAt", "summary"
        ) VALUES (
          gen_random_uuid(), gen_random_uuid(), 1, gen_random_uuid(), CURRENT_TIMESTAMP, 'legacy summary'
        )
      `;

      for (const statement of statements) {
        await transaction.$executeRawUnsafe(statement);
      }

      const rows = await transaction.$queryRaw<Array<{
        summary: string | null;
        familyScore: number | null;
        eatingScore: number | null;
        workScore: number | null;
        healthScore: number | null;
        financeScore: number | null;
        travelScore: number | null;
        exerciseScore: number | null;
        wellbeingScore: number | null;
      }>>`
        SELECT
          "summary", "familyScore", "eatingScore", "workScore", "healthScore",
          "financeScore", "travelScore", "exerciseScore", "wellbeingScore"
        FROM "PatientProgramServiceOneFloatingChart"
      `;

      expect(rows).toEqual([{
        summary: "legacy summary",
        familyScore: null,
        eatingScore: null,
        workScore: null,
        healthScore: null,
        financeScore: null,
        travelScore: null,
        exerciseScore: null,
        wellbeingScore: null,
      }]);
    });
  });
});
