import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FORM_CONTRACT_REGISTRY } from "../../../tests/support/form-contract";

/**
 * Every server-side parser that rejects unknown FormData keys must have a registered form ↔ server
 * contract test (tests/support/form-contract.ts explains how to register one). A strict parser is any
 * non-test source file that uses one of these checks.
 */
const STRICT_PARSER_PATTERNS: readonly RegExp[] = [
  /hasUnexpectedOrDuplicateFields\(/u,
  /allowedFields\.has\(/u,
  /!Object\.hasOwn\(limits/u,
  /limits\[operation\]\[key\]/u,
  /COMMAND_KEYS\[/u,
];

const REPO_ROOT = process.cwd();
const SOURCE_ROOT = path.join(REPO_ROOT, "src");

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry): Promise<string[]> => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return /\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [entryPath] : [];
  }));
  return nested.flat();
}

function relative(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

async function findStrictParserModules(): Promise<Map<string, string>> {
  const modules = new Map<string, string>();
  for (const filePath of await listSourceFiles(SOURCE_ROOT)) {
    const source = await readFile(filePath, "utf8");
    if (STRICT_PARSER_PATTERNS.some((pattern) => pattern.test(source))) {
      modules.set(relative(filePath), source);
    }
  }
  return modules;
}

const registered = new Map(FORM_CONTRACT_REGISTRY.map((entry) => [entry.module, entry]));

describe("form ↔ server contract coverage", () => {
  it("registers a contract test for every strict FormData parser", async () => {
    const strictModules = await findStrictParserModules();
    const uncovered = [...strictModules.keys()].filter((module) => !registered.has(module)).sort();

    expect(
      uncovered,
      `Strict FormData parsers without a registered form contract test (add one to FORM_CONTRACT_REGISTRY in tests/support/form-contract.ts):\n${uncovered.join("\n")}`,
    ).toEqual([]);
  }, 15_000);

  it("keeps every allow-list of a strict parser exported and registered", async () => {
    const problems: string[] = [];

    for (const [module, source] of await findStrictParserModules()) {
      const entry = registered.get(module);
      if (/^const [A-Z][A-Z0-9_]*_FORM_FIELDS\b/mu.test(source)) {
        problems.push(`${module}: export its *_FORM_FIELDS allow-lists so the contract tests can import them`);
      }
      if (/hasUnexpectedOrDuplicateFields\(\s*formData,\s*new Set\(/u.test(source)) {
        problems.push(`${module}: lift the inline allow-list into a named exported constant`);
      }
      for (const [, name] of source.matchAll(/^export const ([A-Z][A-Z0-9_]*_FORM_FIELD(?:S|_LIMITS))\b/gmu)) {
        if (entry && !entry.contracts.includes(name)) {
          problems.push(`${module}: ${name} has no registered contract test`);
        }
      }
    }

    expect(problems, problems.join("\n")).toEqual([]);
  }, 15_000);

  it("points every registration at existing contract tests that use the registered allow-lists", async () => {
    const problems: string[] = [];

    for (const entry of FORM_CONTRACT_REGISTRY) {
      if (!existsSync(path.join(REPO_ROOT, entry.module))) {
        problems.push(`${entry.module}: registered module does not exist`);
      }
      const sources = await Promise.all(entry.tests.map(async (test) => {
        const testPath = path.join(REPO_ROOT, test);
        if (!existsSync(testPath)) {
          problems.push(`${entry.module}: contract test ${test} does not exist`);
          return "";
        }
        const source = await readFile(testPath, "utf8");
        if (!/expect(?:Form|ActionInput)Contract\(/u.test(source)) {
          problems.push(`${test}: does not call expectFormContract or expectActionInputContract`);
        }
        return source;
      }));
      for (const contract of entry.contracts) {
        if (!sources.some((source) => new RegExp(`\\b${contract}\\b`, "u").test(source))) {
          problems.push(`${entry.module}: no registered test uses ${contract}`);
        }
      }
    }

    expect(problems, problems.join("\n")).toEqual([]);
  });
});
