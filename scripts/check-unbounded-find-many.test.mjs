import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ALLOWLIST_PATH,
  collectCalls,
  compareWithAllowlist,
  findUnboundedFindManyCalls,
  regenerateAllowlist,
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

const allowAll = (calls) => calls.map(({ file, function: name, target, occurrence }) => ({ file, function: name, target, occurrence, reason: "Bounded." }));

describe("unbounded findMany guardrail", () => {
  it("reports findMany calls without a top-level take, by file, enclosing function and model", () => {
    expect(findUnboundedFindManyCalls(source, "src/example.ts")).toEqual([
      { file: "src/example.ts", line: 3, function: "listEverything", target: "hospital", occurrence: 1 },
      { file: "src/example.ts", line: 8, function: "listMemberships", target: "hospitalMembership", occurrence: 1 },
      // An argument that is not an object literal cannot be proven bounded.
      { file: "src/example.ts", line: 10, function: "spread", target: "user", occurrence: 1 },
      { file: "src/example.ts", line: 13, function: "bare", target: "person", occurrence: 1 },
    ]);
  });

  it("reports a nested to-many relation read without take, under findMany and findUnique alike", () => {
    const nested = `async function f(db) {
  await db.hospital.findMany({ take: 5, select: { id: true, managedServiceAreas: { select: { id: true } } } });
  await db.hospital.findUnique({ where: { id: "x" }, include: { memberships: true } });
}`;
    expect(findUnboundedFindManyCalls(nested, "src/nested.ts")).toEqual([
      { file: "src/nested.ts", line: 2, function: "f", target: "hospital.managedServiceAreas", occurrence: 1 },
      { file: "src/nested.ts", line: 3, function: "f", target: "hospital.memberships", occurrence: 1 },
    ]);
  });

  it("does not report a nested list relation with its own take, nor a to-one relation, nor a _count", () => {
    const bounded = `async function f(db) {
  return db.hospital.findMany({ take: 25, select: {
    memberships: { take: 1, select: { id: true } },
    serviceAreaEligibility: { select: { kind: true } },
    _count: { select: { managedServiceAreas: { where: { endedAt: null } } } },
  } });
}`;
    expect(findUnboundedFindManyCalls(bounded, "src/bounded.ts")).toEqual([]);
  });

  it("walks the select tree to the model of each nested selection, through a same-file constant", () => {
    const deep = `const childSelect = { id: true, memberships: { select: { id: true } } } satisfies Prisma.HospitalSelect;
async function f(db) {
  return db.hospitalServiceArea.findFirst({ select: { child: { select: { ...childSelect, serviceAreaAssignments: { take: 1, select: { id: true } } } } } });
}`;
    expect(findUnboundedFindManyCalls(deep, "src/deep.ts")).toEqual([
      { file: "src/deep.ts", line: 1, function: "f", target: "hospitalServiceArea.child.memberships", occurrence: 1 },
    ]);
  });

  it("counts a second identical read in the same function as its own occurrence that needs its own entry", () => {
    const twice = `async function f(db) {
  await db.user.findMany({ where: { id: "a" } });
  await db.user.findMany({ where: { id: "b" } });
}`;
    const calls = findUnboundedFindManyCalls(twice, "src/twice.ts");
    expect(calls.map(({ target, occurrence }) => [target, occurrence])).toEqual([["user", 1], ["user", 2]]);
    const problems = compareWithAllowlist(calls, allowAll(calls.slice(0, 1)));
    expect(problems).toEqual([expect.stringContaining("src/twice.ts:3 in f on user (occurrence 2)")]);
    expect(compareWithAllowlist(calls, allowAll(calls))).toEqual([]);
  });

  it("fails on a new unbounded read that is not allowlisted, and on an allowlist entry without a reason", () => {
    const calls = findUnboundedFindManyCalls(source, "src/example.ts");
    const allowlist = allowAll(calls.slice(1));

    const problems = compareWithAllowlist(calls, allowlist);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("src/example.ts:3 in listEverything on hospital");

    expect(compareWithAllowlist(calls, [...allowlist, { ...allowAll(calls.slice(0, 1))[0], reason: " " }]))
      .toEqual([expect.stringContaining("without a reason")]);
  });

  it("fails on a stale allowlist entry so the list keeps matching the code", () => {
    const problems = compareWithAllowlist([], [{ file: "src/gone.ts", function: "old", target: "user", occurrence: 1, reason: "Bounded." }]);
    expect(problems).toEqual([expect.stringContaining("Stale allowlist entry")]);
  });

  it("regenerates the allowlist keeping existing reasons and leaving new reads without one", () => {
    const calls = findUnboundedFindManyCalls(source, "src/example.ts");
    const regenerated = regenerateAllowlist(calls, [{ ...allowAll(calls)[0], reason: "Kept." }]);
    expect(regenerated.map(({ reason }) => reason)).toEqual(["Kept.", "", "", ""]);
  });

  it("passes on the repository with its reviewed allowlist", async () => {
    const allowlist = JSON.parse(await readFile(ALLOWLIST_PATH, "utf8"));
    expect(compareWithAllowlist(await collectCalls(), allowlist)).toEqual([]);
  }, 60_000);
});
