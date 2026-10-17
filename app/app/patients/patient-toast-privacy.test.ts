import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const patientsRoot = join(process.cwd(), "app", "app", "patients");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

// Arguments that are not a literal must come from these reviewed static tables.
const reviewedReferences = [/^copy\.(success|conflict|forbidden)$/, /^assignmentToasts\[result\.result\.operation\]$/];

type NotifyCall = { file: string; argument: string };

function notifyCalls(): NotifyCall[] {
  const calls: NotifyCall[] = [];
  for (const file of sourceFiles(patientsRoot)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/notify\.(?:success|warning|error|info)\(\s*([^)]*?)\s*\)/g)) {
      calls.push({ file, argument: match[1] });
    }
  }
  return calls;
}

describe("Patient workflow Toast copy", () => {
  const calls = notifyCalls();

  it("finds the Patient workflow Toast calls", () => {
    expect(calls.length).toBeGreaterThan(20);
  });

  it("only passes reviewed static copy: no interpolation, no variables from results or forms", () => {
    for (const { file, argument } of calls) {
      const literal = /^"([^"\\]*)"$/.exec(argument);
      const reviewed = reviewedReferences.some((pattern) => pattern.test(argument));
      expect(literal !== null || reviewed, `${file}: ${argument}`).toBe(true);
    }
  });

  it("keeps static copy short, Thai and free of identifiers, digits or mojibake", () => {
    const literals = calls.flatMap(({ argument }) => {
      const match = /^"([^"\\]*)"$/.exec(argument);
      return match ? [match[1]] : [];
    });
    expect(literals.length).toBeGreaterThan(15);
    for (const message of literals) {
      expect(message, message).toMatch(/^[\u0E00-\u0E7F .-]+$/);
      expect(message.length, message).toBeLessThanOrEqual(80);
    }
  });

  it("keeps the reviewed copy tables static Thai text too", () => {
    const tableSources = [
      "[relationshipId]/assignment/patient-osm-assignment-workspace.tsx",
      "[relationshipId]/hospital-patient-edit-form.tsx",
      "patient-name-correction-form.tsx",
    ].map((file) => readFileSync(join(patientsRoot, file), "utf8"));
    const copies = tableSources.flatMap((source) =>
      [...source.matchAll(/(?:success|conflict|forbidden|ASSIGNED|REASSIGNED|UNASSIGNED):\s*(?:health \? )?"([^"]+)"(?: : "([^"]+)")?/g)].flatMap(
        (match) => [match[1], match[2]].filter((value): value is string => Boolean(value)),
      ),
    );
    expect(copies.length).toBeGreaterThan(8);
    for (const message of copies) {
      expect(message, message).toMatch(/^[\u0E00-\u0E7F .-]+$/);
    }
  });
});
