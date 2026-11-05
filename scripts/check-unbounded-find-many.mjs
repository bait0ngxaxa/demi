#!/usr/bin/env node
// Lists Prisma `findMany` calls in production code (src/, app/) whose argument has no top-level `take`, and fails
// when one is not in the reviewed allowlist. A naturally bounded read (one user's memberships, an `id IN` list, at
// most 12 rounds, ...) is added to scripts/unbounded-find-many-allowlist.json with a one-line reason.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRECTORIES = ["src", "app"];
export const ALLOWLIST_PATH = path.join(repositoryRoot, "scripts", "unbounded-find-many-allowlist.json");

function isTestFile(fileName) {
  return /\.test\.(?:ts|tsx|mts|mjs)$/u.test(fileName);
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name.startsWith(".") ? [] : listSourceFiles(entryPath);
    return /\.(?:ts|tsx)$/u.test(entry.name) && !entry.name.endsWith(".d.ts") && !isTestFile(entry.name) ? [entryPath] : [];
  }));
  return nested.flat();
}

/** The name of the closest named function, method or variable-held function around a node. */
function enclosingName(node) {
  for (let current = node.parent; current; current = current.parent) {
    if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name) return current.name.getText();
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isVariableDeclaration(current.parent)) {
      return current.parent.name.getText();
    }
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isPropertyAssignment(current.parent)) {
      return current.parent.name.getText();
    }
  }
  return "<module>";
}

/** The delegate a findMany is called on: `database.hospital.findMany` -> `hospital`. */
function modelName(callee) {
  const target = callee.expression;
  if (ts.isPropertyAccessExpression(target)) return target.name.text;
  if (ts.isIdentifier(target)) return target.text;
  return target.getText();
}

function hasTopLevelTake(argument) {
  return ts.isObjectLiteralExpression(argument) && argument.properties.some((property) =>
    (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
    property.name && property.name.getText() === "take");
}

/**
 * Every `<delegate>.findMany(...)` in one file without a top-level `take` in its literal argument. An argument that is
 * not an object literal (a variable, a spread-only object) cannot be proven bounded, so it is reported too.
 */
export function findUnboundedFindManyCalls(sourceText, fileName) {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "findMany") {
      const [argument] = node.arguments;
      if (!argument || !hasTopLevelTake(argument)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        calls.push({ file: fileName, line: line + 1, function: enclosingName(node), model: modelName(node.expression) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

export function allowlistKey(entry) {
  return `${entry.file} :: ${entry.function} :: ${entry.model}`;
}

/** Compares the calls with the allowlist: unreviewed calls fail, and so do entries that no longer match a call. */
export function compareWithAllowlist(calls, allowlist) {
  const problems = [];
  const allowed = new Map();
  for (const entry of allowlist) {
    if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
      problems.push(`Allowlist entry without a reason: ${allowlistKey(entry)}`);
    }
    allowed.set(allowlistKey(entry), entry);
  }
  const seen = new Set();
  for (const call of calls) {
    const key = allowlistKey(call);
    seen.add(key);
    if (!allowed.has(key)) {
      problems.push(`Unbounded findMany (no top-level take) at ${call.file}:${call.line} in ${call.function} on ${call.model}. ` +
        "Page or limit it, or add it to scripts/unbounded-find-many-allowlist.json with a one-line reason.");
    }
  }
  for (const key of allowed.keys()) {
    if (!seen.has(key)) problems.push(`Stale allowlist entry (no such findMany any more): ${key}`);
  }
  return problems;
}

export async function collectCalls(root = repositoryRoot) {
  const files = (await Promise.all(SOURCE_DIRECTORIES.map((directory) => listSourceFiles(path.join(root, directory))))).flat();
  const calls = [];
  for (const file of files.sort()) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    calls.push(...findUnboundedFindManyCalls(await readFile(file, "utf8"), relative));
  }
  return calls;
}

async function main() {
  const calls = await collectCalls();
  if (process.argv.includes("--list")) {
    console.log(JSON.stringify(calls.map(({ file, function: name, model }) => ({ file, function: name, model, reason: "" })), null, 2));
    return;
  }
  const allowlist = JSON.parse(await readFile(ALLOWLIST_PATH, "utf8"));
  const problems = compareWithAllowlist(calls, allowlist);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
    return;
  }
  const followUps = allowlist.filter(({ reason }) => reason.startsWith("FOLLOW-UP:")).length;
  console.log(`findMany guardrail: ${calls.length} reviewed unbounded reads, none new (${followUps} marked FOLLOW-UP).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
