import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { findMigrationOrderViolations } from "./migration-order.mjs";

const base = [
  "20261024100000_patient_hospital_relationship_end_integrity",
  "20261025100000_patient_hospital_relationship_reason_whitespace",
  "migration_lock.toml",
];

function readTemporaryMigrationDirectory(names) {
  const directory = mkdtempSync(join(tmpdir(), "demi-migrations-"));
  try {
    for (const name of names) mkdirSync(join(directory, name));
    return readdirSync(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("migration order check", () => {
  it("passes on the committed migrations of the current tree", () => {
    const current = readdirSync(resolve(import.meta.dirname, "..", "prisma", "migrations"));

    expect(findMigrationOrderViolations({ current, base: current })).toEqual([]);
  });

  it("accepts a new migration that sorts after the latest committed one", () => {
    expect(findMigrationOrderViolations({
      current: [...base, "20261025100100_area_follow_up"],
      base,
    })).toEqual([]);
  });

  it("fails a new migration named with today's real date while committed migrations are future-dated", () => {
    expect(findMigrationOrderViolations({
      current: [...base, "20261017120000_mis_ordered_change"],
      base,
    })).toEqual([
      "20261017120000_mis_ordered_change: new migration must sort after the latest committed migration 20261025100000_patient_hospital_relationship_reason_whitespace",
    ]);
  });

  it("tolerates the shared timestamp already in committed history but rejects a new one", () => {
    const committed = ["20261002120000_family_delegated_appointment_read", "20261002120000_personal_medication_foundation"];

    expect(findMigrationOrderViolations({ current: committed, base: committed })).toEqual([]);
    expect(findMigrationOrderViolations({
      current: [...committed, "20261002120000_zz_new_change"],
      base: committed,
    })).toContain("20261002120000_zz_new_change: timestamp duplicates 20261002120000_family_delegated_appointment_read");
  });

  it("rejects a new timestamp collision regardless of directory enumeration order", () => {
    const committed = ["20261002120000_family_delegated_appointment_read", "20261002120000_personal_medication_foundation"];
    const newCollision = "20261002120000_00_new_change";
    const first = findMigrationOrderViolations({
      current: readTemporaryMigrationDirectory([newCollision, ...committed]),
      base: committed,
    });

    expect(first).toContain(`${newCollision}: timestamp duplicates 20261002120000_family_delegated_appointment_read`);
    expect(first).toContain(`${newCollision}: new migration must sort after the latest committed migration 20261002120000_personal_medication_foundation`);
    expect(findMigrationOrderViolations({
      current: readTemporaryMigrationDirectory([...committed, newCollision]),
      base: committed,
    })).toEqual(first);
  });

  it("fails a renamed or removed committed migration", () => {
    expect(findMigrationOrderViolations({
      current: ["20261024100000_patient_hospital_relationship_end_integrity", "20261026100000_renamed", "migration_lock.toml"],
      base,
    })).toEqual([
      "20261025100000_patient_hospital_relationship_reason_whitespace: committed migration was renamed or removed",
    ]);
  });

  it("fails malformed names, impossible timestamps and duplicate timestamps", () => {
    expect(findMigrationOrderViolations({
      current: [...base, "20261026_short", "20261332100000_bad_month", "20260230120000_bad_day", "20261027100000_one", "20261027100000_two", "20261028100000_Camel"],
      base,
    })).toEqual([
      "20260230120000_bad_day: timestamp is not a valid UTC date-time",
      "20261026_short: name must be <YYYYMMDDHHMMSS>_<lower_snake_case>",
      "20261027100000_two: timestamp duplicates 20261027100000_one",
      "20261028100000_Camel: name must be <YYYYMMDDHHMMSS>_<lower_snake_case>",
      "20261332100000_bad_month: timestamp is not a valid UTC date-time",
    ]);
  });

  it("uses an explicit base reference in the checker CLI", () => {
    const script = resolve(import.meta.dirname, "check-migration-order.mjs");
    const result = spawnSync(process.execPath, [script, "HEAD"], {
      cwd: resolve(import.meta.dirname, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("base HEAD.");
  });
});
