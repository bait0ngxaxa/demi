import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * MP-0: every OWNER gate must be classified in docs/requirements/AUTHZ_CAPABILITY_INVENTORY.md.
 * A match belongs to the top-level declaration that contains it; one outside any declaration is `<module>`.
 */
const root = process.cwd();
const scannedRoots = ["src", "app"];
const ownerGatePattern = /MembershipType\.OWNER|assertOwnerInDatabase|"OWNER"/gu;
const inventoryPath = resolve(root, "docs/requirements/AUTHZ_CAPABILITY_INVENTORY.md");
const inventoryRowPattern = /^\| `([^`]+)` \| `([^`]+)` \|/u;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

function declarationName(statement: ts.Statement): string {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map(({ name }) => name.getText()).join(",");
  }
  if (ts.isExportAssignment(statement)) return "default";
  const { name } = statement as ts.Statement & { name?: ts.Node };
  return name ? name.getText() : "<module>";
}

function ownerGateKeys(): Set<string> {
  const keys = new Set<string>();
  for (const path of scannedRoots.flatMap((directory) => sourceFiles(resolve(root, directory)))) {
    const text = readFileSync(path, "utf8");
    const matches = [...text.matchAll(ownerGatePattern)];
    if (matches.length === 0) continue;
    const source = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const file = relative(root, path).split("\\").join("/");
    for (const match of matches) {
      const statement = source.statements.find((candidate) =>
        candidate.getStart(source) <= match.index && match.index < candidate.end);
      keys.add(`${file} :: ${statement ? declarationName(statement) : "<module>"}`);
    }
  }
  return keys;
}

function inventoryKeys(): Set<string> {
  return new Set(readFileSync(inventoryPath, "utf8").split(/\r?\n/u).flatMap((line) => {
    const row = inventoryRowPattern.exec(line);
    return row ? [`${row[1]} :: ${row[2]}`] : [];
  }));
}

// Parsing every matching file takes seconds under a loaded full-suite run; scan once for both assertions.
const SCAN_TIMEOUT_MS = 60_000;

describe("authorization capability inventory", () => {
  let gates: Set<string>;

  beforeAll(() => {
    gates = ownerGateKeys();
  }, SCAN_TIMEOUT_MS);

  it("classifies every OWNER gate in src/ and app/", () => {
    const classified = inventoryKeys();
    const missing = [...gates].filter((key) => !classified.has(key)).sort();

    expect(missing).toEqual([]);
  });

  it("finds the gates it is meant to guard", () => {
    expect(gates).toContain("src/modules/workforce/services/workforce-service.ts :: assertOwnerInDatabase");
    expect(gates).toContain("src/modules/hospital-contact/policies/hospital-contact-policy.ts :: decideHospitalContactPolicy");
  });
});
