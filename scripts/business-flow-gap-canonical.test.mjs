import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Guards docs/requirements/BUSINESS_FLOW_GAP_CANONICAL.md (P1 Part B): one known status token per capability row and
// a §8.6 summary that matches the rows.
const STATUSES = ["VERIFIED_COMPLETE", "IMPLEMENTED", "PARTIAL", "MISSING", "CONTENT_PENDING", "AGENCY_GOVERNED", "SUPERSEDED", "RETIRED"];
const document = readFileSync(resolve(import.meta.dirname, "../docs/requirements/BUSINESS_FLOW_GAP_CANONICAL.md"), "utf8").replace(/\r\n/gu, "\n");

function section(startHeading, endHeading) {
  const start = document.indexOf(startHeading);
  const end = document.indexOf(endHeading, start);
  if (start === -1 || end === -1) throw new Error(`Section ${startHeading} not found`);
  return document.slice(start, end);
}

function capabilityRows() {
  return section("## 8. Customer capability inventory", "### 8.6 Inventory summary")
    .split("\n")
    .filter((line) => /^\| [A-Z]+-\d+ \|/u.test(line))
    .map((line) => {
      const cells = line.split(" | ");
      return { id: cells[0].slice(2), cells, tokens: [...(cells[6] ?? "").matchAll(/\*\*([A-Z][A-Z_]+)\b/gu)].map((match) => match[1]) };
    });
}

function summaryCounts() {
  const table = section("| Current status (recounted", "BF-GAP-01R does not mark a capability VERIFIED_COMPLETE");
  const counts = {};
  for (const match of table.matchAll(/^\| ([A-Z_]+) \| (\d+) \|$/gmu)) counts[match[1]] = Number(match[2]);
  const total = table.match(/^\| \*\*Total\*\* \| \*\*(\d+)\*\* \|$/mu);
  return { counts, total: total ? Number(total[1]) : null };
}

describe("BUSINESS_FLOW_GAP_CANONICAL status register", () => {
  const rows = capabilityRows();

  it("has 8-column rows with unique IDs", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.cells.length !== 8).map((row) => row.id)).toEqual([]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it("gives every row exactly one known bold status token", () => {
    expect(rows.filter((row) => row.tokens.length !== 1).map((row) => `${row.id}: ${row.tokens.join(",") || "none"}`)).toEqual([]);
    expect(rows.filter((row) => !STATUSES.includes(row.tokens[0])).map((row) => `${row.id}: ${row.tokens[0]}`)).toEqual([]);
  });

  it("keeps the §8.6 summary equal to the table", () => {
    const actual = Object.fromEntries(STATUSES.map((status) => [status, rows.filter((row) => row.tokens[0] === status).length]));
    const summary = summaryCounts();
    expect(summary.counts).toEqual(actual);
    expect(summary.total).toBe(rows.length);
  });

  it("states a concrete missing item for every PARTIAL row", () => {
    const partial = rows.filter((row) => row.tokens[0] === "PARTIAL");
    expect(partial.filter((row) => !/Concrete missing item:/u.test(row.cells[6])).map((row) => row.id)).toEqual([]);
  });
});
