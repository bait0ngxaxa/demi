import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ALLOWLIST_PATH,
  collectCalls,
  compareWithAllowlist,
  findUnboundedFindManyCalls,
} from "./check-unbounded-find-many.mjs";

const source = `
export async function listEverything(database) {
  return database.hospital.findMany({ where: { status: "ACTIVE" } });
}
export async function listPage(database) {
  return database.hospital.findMany({ where: {}, skip: 25, take: 25 });
}
export const listMemberships = async (tx, userId) => tx.hospitalMembership.findMany({ where: { userId } });
async function spread(database, args) {
  return database.user.findMany(args);
}
async function bare(database) {
  return database.person.findMany();
}
`;

describe("unbounded findMany guardrail", () => {
  it("reports findMany calls without a top-level take, by file, enclosing function and model", () => {
    expect(findUnboundedFindManyCalls(source, "src/example.ts")).toEqual([
      { file: "src/example.ts", line: 3, function: "listEverything", model: "hospital" },
      { file: "src/example.ts", line: 8, function: "listMemberships", model: "hospitalMembership" },
      // An argument that is not an object literal cannot be proven bounded.
      { file: "src/example.ts", line: 10, function: "spread", model: "user" },
      { file: "src/example.ts", line: 13, function: "bare", model: "person" },
    ]);
  });

  it("ignores a nested take that only bounds a relation", () => {
    const nested = `async function f(db) { return db.hospital.findMany({ select: { memberships: { take: 1, select: { id: true } } } }); }`;
    expect(findUnboundedFindManyCalls(nested, "src/nested.ts")).toHaveLength(1);
  });

  it("fails on a new unbounded read that is not allowlisted, and on an allowlist entry without a reason", () => {
    const calls = findUnboundedFindManyCalls(source, "src/example.ts");
    const allowlist = calls.slice(1).map((call) => ({ file: call.file, function: call.function, model: call.model, reason: "Bounded." }));

    const problems = compareWithAllowlist(calls, allowlist);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("src/example.ts:3 in listEverything on hospital");

    expect(compareWithAllowlist(calls, [...allowlist, { ...allowlist[0], function: "listEverything", model: "hospital", reason: " " }]))
      .toEqual([expect.stringContaining("without a reason")]);
  });

  it("fails on a stale allowlist entry so the list keeps matching the code", () => {
    const problems = compareWithAllowlist([], [{ file: "src/gone.ts", function: "old", model: "user", reason: "Bounded." }]);
    expect(problems).toEqual([expect.stringContaining("Stale allowlist entry")]);
  });

  it("passes on the repository with its reviewed allowlist", async () => {
    const allowlist = JSON.parse(await readFile(ALLOWLIST_PATH, "utf8"));
    expect(compareWithAllowlist(await collectCalls(), allowlist)).toEqual([]);
  }, 60_000);
});
