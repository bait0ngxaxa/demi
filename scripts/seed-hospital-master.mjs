import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

const repositoryRoot = resolve(import.meta.dirname, "..");
const fixturePath = resolve(repositoryRoot, "prisma", "seed", "hospital-master-v2.json");
const allowedTargets = new Set(["development", "test"]);

function loadDotEnv(fileName) {
  const filePath = resolve(repositoryRoot, fileName);

  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
  }
}

function fail(message) {
  console.error(`Hospital master seed failed: ${message}`);
  process.exitCode = 1;
}

loadDotEnv(".env");
loadDotEnv(".env.local");

const databaseTarget = process.env.DEMI_DATABASE_TARGET;

if (!databaseTarget || !allowedTargets.has(databaseTarget) || process.env.NODE_ENV === "production") {
  fail("DEMI_DATABASE_TARGET must be development or test and NODE_ENV must not be production");
} else if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  fail("DATABASE_URL and DIRECT_URL are required");
} else {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

  if (!Array.isArray(fixture) || fixture.length !== 78) {
    fail("the approved fixture must contain exactly 78 records");
  } else {
    const codes = new Set();

    for (const record of fixture) {
      if (
        !record ||
        typeof record.canonicalCode !== "string" ||
        !/^[A-Z0-9][A-Z0-9_-]{0,31}$/u.test(record.canonicalCode) ||
        typeof record.nameTh !== "string" ||
        !record.nameTh.trim()
      ) {
        fail("the fixture contains an invalid hospital record");
        break;
      }

      if (codes.has(record.canonicalCode)) {
        fail(`duplicate canonical code ${record.canonicalCode}`);
        break;
      }

      codes.add(record.canonicalCode);
    }

    if (process.exitCode !== 1) {
      if (codes.has("HH")) {
        fail("the excluded HH record must not be present");
      }

      const kang = fixture.find((record) => record.canonicalCode === "KANG");
      const khon = fixture.find((record) => record.canonicalCode === "KHON");
      const subCount = fixture.filter((record) => record.parentCanonicalCode).length;

      if (kang?.nameTh !== "โรงพยาบาลแก่งคอย" || khon?.nameTh !== "โรงพยาบาลขอนแก่น") {
        fail("the approved KANG/KHON canonical corrections are missing");
      }

      if (subCount !== 35 || fixture.length - subCount !== 43) {
        fail("the approved fixture must contain 43 MAIN and 35 SUB records");
      }

      for (const record of fixture) {
        if (record.parentCanonicalCode && !codes.has(record.parentCanonicalCode)) {
          fail(`unknown parent canonical code ${record.parentCanonicalCode}`);
          break;
        }

        if (record.parentCanonicalCode === record.canonicalCode) {
          fail(`hospital ${record.canonicalCode} cannot be its own parent`);
          break;
        }
      }
    }

    if (process.exitCode !== 1) {
      const prisma = new PrismaClient();

      try {
        await prisma.$transaction(async (tx) => {
          const idsByCode = new Map();

          for (const record of fixture) {
            const hospital = await tx.hospital.upsert({
              where: { hospitalCode: record.canonicalCode },
              update: { name: record.nameTh },
              create: { hospitalCode: record.canonicalCode, name: record.nameTh },
              select: { id: true },
            });

            idsByCode.set(record.canonicalCode, hospital.id);
          }

          for (const record of fixture) {
            await tx.hospital.update({
              where: { hospitalCode: record.canonicalCode },
              data: {
                parentHospitalId: record.parentCanonicalCode
                  ? idsByCode.get(record.parentCanonicalCode)
                  : null,
              },
            });
          }
        });

        console.log(`Hospital master seed imported ${fixture.length} records for ${databaseTarget}`);
      } catch {
        console.error("Hospital master seed could not be completed");
        process.exitCode = 1;
      } finally {
        await prisma.$disconnect();
      }
    }
  }
}
