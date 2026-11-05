#!/usr/bin/env node
// Lists unbounded Prisma reads in production code (src/, app/) and fails when one is not in the reviewed allowlist:
// - a `findMany` whose argument has no top-level `take`;
// - a to-many relation read inside a findMany / findFirst / findUnique argument (`include: { rel: true }`,
//   `select: { rel: { select: ... } }`, ...) without its own `take`. List relations come from the Prisma DMMF of the
//   generated client, and the model of each nested selection is found by walking the select / include tree.
// A naturally bounded read (one user's memberships, an `id IN` list, at most 12 rounds, ...) is added to
// scripts/unbounded-find-many-allowlist.json with a one-line reason. `--list` regenerates the allowlist from the code
// and keeps the reasons it already has.
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRECTORIES = ["src", "app"];
export const ALLOWLIST_PATH = path.join(repositoryRoot, "scripts", "unbounded-find-many-allowlist.json");
const READ_METHODS = new Set(["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow"]);
const MAX_RESOLVE_DEPTH = 8;

/** model name -> (relation field -> { isList, type }), and Prisma delegate name -> model name, from the DMMF. */
export function loadPrismaRelations() {
  const { Prisma } = createRequire(import.meta.url)("@prisma/client");
  const relations = new Map();
  const delegates = new Map();
  for (const model of Prisma.dmmf.datamodel.models) {
    delegates.set(model.name.charAt(0).toLowerCase() + model.name.slice(1), model.name);
    relations.set(model.name, new Map(model.fields
      .filter((field) => field.kind === "object")
      .map((field) => [field.name, { isList: field.isList, type: field.type }])));
  }
  return { relations, delegates };
}

let cachedSchema;
function defaultSchema() {
  cachedSchema ??= loadPrismaRelations();
  return cachedSchema;
}

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

/** The delegate a query is called on: `database.hospital.findMany` -> `hospital`. */
function delegateName(callee) {
  const target = callee.expression;
  if (ts.isPropertyAccessExpression(target)) return target.name.text;
  if (ts.isIdentifier(target)) return target.text;
  return target.getText();
}

function propertyName(property) {
  const { name } = property;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function unwrap(node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isSatisfiesExpression(current) || ts.isAsExpression(current))) {
    current = current.expression;
  }
  return current;
}

/** `const` object literals declared in the file, so a shared `select` constant is followed like an inline one. */
function collectConstObjects(source) {
  const found = new Map();
  const ambiguous = new Set();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = unwrap(node.initializer);
      if (ts.isObjectLiteralExpression(value)) {
        if (found.has(node.name.text)) ambiguous.add(node.name.text);
        found.set(node.name.text, value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const name of ambiguous) found.delete(name);
  return found;
}

function resolveObject(node, constObjects, depth = 0) {
  const value = unwrap(node);
  if (!value || depth > MAX_RESOLVE_DEPTH) return null;
  if (ts.isObjectLiteralExpression(value)) return value;
  if (ts.isIdentifier(value)) return constObjects.get(value.text) ?? null;
  return null;
}

/** The properties of an object literal with the spreads of same-file constants inlined: [name, value node, node]. */
function objectEntries(object, constObjects, depth = 0) {
  const entries = [];
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property)) {
      const name = propertyName(property);
      if (name !== null) entries.push([name, property.initializer, property]);
    } else if (ts.isShorthandPropertyAssignment(property)) {
      entries.push([property.name.text, property.name, property]);
    } else if (ts.isSpreadAssignment(property) && depth < MAX_RESOLVE_DEPTH) {
      const spread = resolveObject(property.expression, constObjects, depth + 1);
      if (spread) entries.push(...objectEntries(spread, constObjects, depth + 1));
    }
  }
  return entries;
}

function hasTopLevelTake(argument) {
  return ts.isObjectLiteralExpression(argument) && argument.properties.some((property) =>
    (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && propertyName(property) === "take");
}

/**
 * Every unbounded read in one file: a `findMany` without a top-level `take` (an argument that is not an object
 * literal cannot be proven bounded, so it is reported too), and every to-many relation read under a
 * findMany / findFirst / findUnique `select` or `include` without its own `take`. `target` is the delegate for the
 * first and the relation path (`hospital.managedServiceAreas`) for the second; `occurrence` counts 1, 2, ... per
 * file, function and target, so a second identical read in the same function needs its own allowlist entry.
 */
export function findUnboundedFindManyCalls(sourceText, fileName, schema = defaultSchema()) {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const constObjects = collectConstObjects(source);
  const calls = [];
  const occurrences = new Map();
  const report = (node, functionName, target) => {
    const key = `${functionName} :: ${target}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    calls.push({ file: fileName, line: line + 1, function: functionName, target, occurrence });
  };

  /** A `select` or `include` object of `model` at `targetPath`. */
  const inspectSelection = (selectionNode, model, targetPath, functionName, depth) => {
    const selection = resolveObject(selectionNode, constObjects);
    const fields = schema.relations.get(model);
    if (!selection || !fields || depth > MAX_RESOLVE_DEPTH) return;
    for (const [name, valueNode, node] of objectEntries(selection, constObjects)) {
      if (name === "_count") continue;
      const field = fields.get(name);
      if (!field) continue;
      const relationPath = `${targetPath}.${name}`;
      const value = unwrap(valueNode);
      if (value.kind === ts.SyntaxKind.TrueKeyword) {
        if (field.isList) report(node, functionName, relationPath);
        continue;
      }
      const relationArgs = resolveObject(value, constObjects);
      if (!relationArgs) continue;
      const entries = objectEntries(relationArgs, constObjects);
      if (field.isList && !entries.some(([key]) => key === "take")) report(node, functionName, relationPath);
      inspectArguments(relationArgs, field.type, relationPath, functionName, depth + 1);
    }
  };

  /** The `select` / `include` of a query or relation argument of `model`. */
  const inspectArguments = (argumentsObject, model, targetPath, functionName, depth) => {
    for (const [name, value] of objectEntries(argumentsObject, constObjects)) {
      if (name === "select" || name === "include") inspectSelection(value, model, targetPath, functionName, depth);
    }
  };

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && READ_METHODS.has(node.expression.name.text)) {
      const method = node.expression.name.text;
      const delegate = delegateName(node.expression);
      const functionName = enclosingName(node);
      const [argument] = node.arguments;
      if (method === "findMany" && (!argument || !hasTopLevelTake(argument))) report(node, functionName, delegate);
      const model = schema.delegates.get(delegate);
      const argumentsObject = argument ? resolveObject(argument, constObjects) : null;
      if (model && argumentsObject) inspectArguments(argumentsObject, model, delegate, functionName, 0);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

export function allowlistKey(entry) {
  return `${entry.file} :: ${entry.function} :: ${entry.target} :: ${entry.occurrence}`;
}

/** Compares the calls with the allowlist: unreviewed calls fail, and so do entries that no longer match a call. */
export function compareWithAllowlist(calls, allowlist) {
  const problems = [];
  const allowed = new Map();
  for (const entry of allowlist) {
    if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
      problems.push(`Allowlist entry without a reason: ${allowlistKey(entry)}`);
    }
    if (allowed.has(allowlistKey(entry))) problems.push(`Duplicate allowlist entry: ${allowlistKey(entry)}`);
    allowed.set(allowlistKey(entry), entry);
  }
  const seen = new Set();
  for (const call of calls) {
    const key = allowlistKey(call);
    seen.add(key);
    if (!allowed.has(key)) {
      const kind = call.target.includes(".") ? "To-many relation read without take" : "Unbounded findMany (no top-level take)";
      problems.push(`${kind} at ${call.file}:${call.line} in ${call.function} on ${call.target} (occurrence ${call.occurrence}). ` +
        "Page or limit it, or add it to scripts/unbounded-find-many-allowlist.json with a one-line reason.");
    }
  }
  for (const key of allowed.keys()) {
    if (!seen.has(key)) problems.push(`Stale allowlist entry (no such read any more): ${key}`);
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

/** The allowlist for the current code, keeping each reason the existing list gives the same read. */
export function regenerateAllowlist(calls, existing) {
  const reasons = new Map(existing.map((entry) => [allowlistKey(entry), entry.reason]));
  return calls.map(({ file, function: name, target, occurrence }) => ({
    file, function: name, target, occurrence, reason: reasons.get(allowlistKey({ file, function: name, target, occurrence })) ?? "",
  }));
}

async function main() {
  const calls = await collectCalls();
  const allowlist = JSON.parse(await readFile(ALLOWLIST_PATH, "utf8"));
  if (process.argv.includes("--list")) {
    console.log(JSON.stringify(regenerateAllowlist(calls, allowlist), null, 2));
    return;
  }
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
