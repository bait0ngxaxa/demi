// Prisma applies migrations in folder-name order. A new folder whose timestamp sorts before an already-committed one
// would be applied out of order on fresh databases and flagged as drift on existing ones, so every migration added
// after the base ref must sort after all of the base's migrations, and committed folders are never renamed or removed.

const MIGRATION_NAME = /^(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*$/u;
export const NON_MIGRATION_ENTRIES = new Set(["migration_lock.toml"]);

function isCalendarTimestamp(timestamp) {
  const [year, month, day, hour, minute, second] = [
    timestamp.slice(0, 4), timestamp.slice(4, 6), timestamp.slice(6, 8),
    timestamp.slice(8, 10), timestamp.slice(10, 12), timestamp.slice(12, 14),
  ].map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day &&
    date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
}

/**
 * @param {{ current: readonly string[]; base: readonly string[] }} input migration folder names in the working tree
 *   and at the base ref (non-migration entries such as migration_lock.toml are ignored).
 * @returns {string[]} human-readable violations; empty when the order is safe.
 */
export function findMigrationOrderViolations({ current, base }) {
  const violations = [];
  const currentNames = current.filter((name) => !NON_MIGRATION_ENTRIES.has(name)).sort();
  const baseNames = new Set(base.filter((name) => !NON_MIGRATION_ENTRIES.has(name)));
  const namesByTimestamp = new Map();
  const validCurrentNames = new Set();

  for (const name of currentNames) {
    const match = MIGRATION_NAME.exec(name);
    if (!match) {
      violations.push(`${name}: name must be <YYYYMMDDHHMMSS>_<lower_snake_case>`);
      continue;
    }
    if (!isCalendarTimestamp(match[1])) {
      violations.push(`${name}: timestamp is not a valid UTC date-time`);
      continue;
    }

    validCurrentNames.add(name);
    const names = namesByTimestamp.get(match[1]) ?? [];
    names.push(name);
    namesByTimestamp.set(match[1], names);
  }

  for (const names of namesByTimestamp.values()) {
    if (names.length < 2) continue;
    const committedNames = names.filter((name) => baseNames.has(name));
    const newNames = names.filter((name) => !baseNames.has(name));
    if (committedNames.length > 0) {
      for (const name of newNames) {
        violations.push(`${name}: timestamp duplicates ${committedNames[0]}`);
      }
    } else {
      for (const name of newNames.slice(1)) {
        violations.push(`${name}: timestamp duplicates ${newNames[0]}`);
      }
    }
  }

  const currentNameSet = new Set(currentNames);
  for (const name of [...baseNames].sort()) {
    if (!currentNameSet.has(name)) violations.push(`${name}: committed migration was renamed or removed`);
  }

  const latestBase = [...baseNames].sort().at(-1);
  if (latestBase) {
    for (const name of validCurrentNames) {
      if (!baseNames.has(name) && name <= latestBase) {
        violations.push(`${name}: new migration must sort after the latest committed migration ${latestBase}`);
      }
    }
  }

  return violations.sort();
}
