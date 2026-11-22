import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// The request-scoped actor is for server component renders only. Server actions and route handlers mutate state or
// change authentication, so they must resolve the actor fresh through getProtectedApplicationActor; this guard rejects
// any import path, direct or transitive, from those entry points to the cached module.
const ROOT = process.cwd();
const CACHED_ACTOR_MODULE = "src/modules/auth/services/request-application-actor.ts";
const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;

function toRepoPath(path: string): string {
  return relative(ROOT, path).replaceAll("\\", "/");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)))
    .filter((entry) => !/\.(?:test|spec)\./u.test(entry.name) && !entry.name.endsWith(".d.ts"))
    .map((entry) => toRepoPath(join(entry.parentPath, entry.name)));
}

/** Module specifiers of static imports, re-exports and dynamic `import()` calls, from TypeScript's import scanner. */
function moduleSpecifiers(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName);
}

const existingFiles = new Map<string, boolean>();

function fileExists(path: string): boolean {
  const known = existingFiles.get(path);
  if (known !== undefined) return known;
  const exists = existsSync(path);
  existingFiles.set(path, exists);
  return exists;
}

function resolveSourceImport(specifier: string, importer: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(ROOT, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(ROOT, dirname(importer), specifier)
      : null;
  if (!base) return null;
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];
  const match = candidates.find((candidate) => SOURCE_EXTENSIONS.some((extension) => candidate.endsWith(extension)) &&
    fileExists(candidate));
  return match ? toRepoPath(match) : null;
}

function hasUseServerDirective(source: string, filename: string): boolean {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === "use server") return true;
  }
  return false;
}

function isMutationEntryPoint(filename: string, source: string): boolean {
  return /(?:^|\/)route\.tsx?$/u.test(filename) || hasUseServerDirective(source, filename);
}

/** Shortest import chain from each mutation entry point that reaches the cached actor module. */
function cachedActorImportChains(files: readonly string[], readSource: (filename: string) => string): string[] {
  const importers = new Map<string, string[]>();
  for (const filename of files) {
    for (const specifier of moduleSpecifiers(readSource(filename))) {
      const target = resolveSourceImport(specifier, filename);
      if (target === null) continue;
      const known = importers.get(target);
      if (known) known.push(filename);
      else importers.set(target, [filename]);
    }
  }
  // One reverse walk from the cached module: `next` points each importing file one step closer to it.
  const next = new Map<string, string | null>([[CACHED_ACTOR_MODULE, null]]);
  const queue = [CACHED_ACTOR_MODULE];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index] as string;
    for (const importer of importers.get(current) ?? []) {
      if (next.has(importer)) continue;
      next.set(importer, current);
      queue.push(importer);
    }
  }
  return files
    .filter((filename) => next.has(filename) && isMutationEntryPoint(filename, readSource(filename)))
    .map((entry) => {
      const chain: string[] = [];
      for (let step: string | null = entry; step !== null; step = next.get(step) ?? null) chain.push(step);
      return chain.join(" -> ");
    });
}

describe("request-scoped actor import guard", () => {
  it("recognizes route handlers and server action modules as mutation entry points", () => {
    expect(isMutationEntryPoint("app/api/example/route.ts", "export async function POST() {}")).toBe(true);
    expect(isMutationEntryPoint("src/modules/x/transport/server-actions.ts", '"use server";\nexport {};')).toBe(true);
    expect(isMutationEntryPoint("src/modules/x/transport/a.ts", '"use strict";\n"use server";\nexport {};')).toBe(true);
    expect(isMutationEntryPoint("app/app/page.tsx", 'import "server-only";\nexport {};')).toBe(false);
  });

  it("reports a transitive import chain from a mutation entry point", () => {
    const entry = "src/guard-fixture/route.ts";
    const context = "src/modules/reporting/transport/parent-area-overview-context.ts";
    const action = "src/guard-fixture/server-actions.ts";
    const fixtureSources = new Map([
      [entry, 'import { getParentAreaOverviewContext } from "@/modules/reporting/transport/parent-area-overview-context";'],
      [action, '"use server";\nexport async function act() { await import("../modules/auth/services/request-application-actor"); }'],
    ]);
    const readSource = (filename: string): string => fixtureSources.get(filename) ?? readFileSync(join(ROOT, filename), "utf8");

    expect(cachedActorImportChains([entry, action, context, CACHED_ACTOR_MODULE], readSource)).toEqual([
      `${entry} -> ${context} -> ${CACHED_ACTOR_MODULE}`,
      `${action} -> ${CACHED_ACTOR_MODULE}`,
    ]);
  });

  it("rejects the cached actor module from every server action and route handler", () => {
    const files = ["app", "src"].flatMap(sourceFiles);
    expect(files).toContain(CACHED_ACTOR_MODULE);
    const sources = new Map<string, string>();
    const readSource = (filename: string): string => {
      const cached = sources.get(filename);
      if (cached !== undefined) return cached;
      const source = readFileSync(join(ROOT, filename), "utf8");
      sources.set(filename, source);
      return source;
    };

    expect(cachedActorImportChains(files, readSource)).toEqual([]);
  });
});
