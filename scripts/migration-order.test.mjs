import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { findMigrationOrderViolations } from "./migration-order.mjs";

const base = [
  "20261024100000_patient_hospital_relationship_end_integrity",
  "20261025100000_patient_hospital_relationship_reason_whitespace",
  "migration_lock.toml",
];

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
      current: [...base, "20261026_short", "20261332100000_bad_month", "20261027100000_one", "20261027100000_two", "20261028100000_Camel"],
      base,
    })).toEqual([
      "20261026_short: name must be <YYYYMMDDHHMMSS>_<lower_snake_case>",
      "20261332100000_bad_month: timestamp is not a valid UTC date-time",
      "20261027100000_two: timestamp duplicates 20261027100000_one",
      "20261028100000_Camel: name must be <YYYYMMDDHHMMSS>_<lower_snake_case>",
    ]);
  });
});
