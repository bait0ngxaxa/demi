import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// DESIGN.md SEARCH-INPUT (2026-11-21): every search field is SearchInput, which hides the native cancel
// pseudo-element and renders its own 48px clear button. A raw `type="search"` would show no clear control.
const SEARCH_INPUT_FILE = "src/components/ui/search-input.tsx";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx") && !/\.(?:test|spec)\./u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** JSX `type="search"` (or `type={"search"}`) attributes; strings elsewhere, e.g. selectors, are not JSX. */
function rawSearchFields(source: string, filename: string): string[] {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "type" && node.initializer) {
      const value = ts.isStringLiteral(node.initializer)
        ? node.initializer.text
        : ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isStringLiteralLike(node.initializer.expression)
          ? node.initializer.expression.text
          : null;
      if (value === "search") found.push(`${filename}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}

describe("SEARCH-INPUT guard", () => {
  it("detects JSX search types but not selectors or other input types", () => {
    const fixture = [
      'export const a = <input type="search" />;',
      'export const b = <Input type={"search"} name="q" />;',
      'export const c = <input type="text" />;',
      'export const d = document.querySelector(\'input[type="search"]\');',
    ].join("\n");
    expect(rawSearchFields(fixture, "fixture.tsx")).toEqual(["fixture.tsx:1", "fixture.tsx:2"]);
  });

  it("renders search fields only through SearchInput", () => {
    const found = ["app", "src"].flatMap((directory) => sourceFiles(directory)).flatMap((path) => {
      const filename = relative(process.cwd(), path).replaceAll("\\", "/");
      if (filename === SEARCH_INPUT_FILE) return [];
      const source = readFileSync(path, "utf8");
      if (!source.includes("search")) return [];
      return rawSearchFields(source, filename);
    });
    expect(found).toEqual([]);
  });
});
