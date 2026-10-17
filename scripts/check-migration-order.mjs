import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { findMigrationOrderViolations } from "./migration-order.mjs";

// Usage: node scripts/check-migration-order.mjs [baseRef]   (default: main)
const repositoryRoot = resolve(import.meta.dirname, "..");
const baseRef = process.argv[2] ?? "main";

const listed = spawnSync("git", ["ls-tree", "--name-only", `${baseRef}:prisma/migrations`], {
  cwd: repositoryRoot,
  encoding: "utf8",
});
if (listed.status !== 0) {
  console.error(`Migration order check could not read prisma/migrations at "${baseRef}": ${listed.stderr.trim()}`);
  process.exit(2);
}

const current = readdirSync(resolve(repositoryRoot, "prisma", "migrations"));
const base = listed.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
const violations = findMigrationOrderViolations({ current, base });

if (violations.length > 0) {
  console.error(`Migration order check failed against ${baseRef}:`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log(`Migration order OK: ${current.length - 1} migrations, base ${baseRef}.`);
