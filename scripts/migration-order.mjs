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
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
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
  const currentNames = current.filter((name) => !NON_MIGRATION_ENTRIES.has(name));
  const baseNames = new Set(base.filter((name) => !NON_MIGRATION_ENTRIES.has(name)));
  const seenTimestamps = new Map();

  for (const name of currentNames) {
    const match = MIGRATION_NAME.exec(name);
    if (!match) {
      violations.push(`${name}: name must be <YYYYMMDDHHMMSS>_<lower_snake_case>`);
      continue;
    }
    if (!isCalendarTimestamp(match[1])) violations.push(`${name}: timestamp is not a valid UTC date-time`);
    // Committed history already contains one shared timestamp (ordered by full folder name); only new folders must be unique.
    const duplicate = seenTimestamps.get(match[1]);
    if (duplicate && !baseNames.has(name)) violations.push(`${name}: timestamp duplicates ${duplicate}`);
    if (!duplicate) seenTimestamps.set(match[1], name);
  }

  for (const name of baseNames) {
    if (!currentNames.includes(name)) violations.push(`${name}: committed migration was renamed or removed`);
  }

  const latestBase = [...baseNames].sort().at(-1);
  if (latestBase) {
    for (const name of currentNames) {
      if (!baseNames.has(name) && name <= latestBase) {
        violations.push(`${name}: new migration must sort after the latest committed migration ${latestBase}`);
      }
    }
  }

  return violations;
}
