import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

function derivesFromBrowserOrigin(source: string): boolean {
  const file = ts.createSourceFile("client.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let violation = false;
  function visit(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node) && node.name.text === "origin" &&
      ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "location" &&
      ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "window") {
      const parent = node.parent;
      // Comparing the current origin protects navigation; using it as a value may construct an activation URL.
      if (!ts.isBinaryExpression(parent) || ![ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind)) violation = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return violation;
}

function clientFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return clientFiles(path);
    if (!entry.isFile() || !entry.name.endsWith(".tsx") || entry.name.includes(".test.")) return [];
    const source = readFileSync(path, "utf8");
    return source.startsWith('"use client"') || source.startsWith("'use client'") ? [path] : [];
  });
}

describe("workforce activation URL client contract", () => {
  it("never derives an activation URL from the browser origin", () => {
    const files = [
      ...clientFiles(join(process.cwd(), "src/components/workforce")),
      ...clientFiles(join(process.cwd(), "app/app/workforce")),
      join(process.cwd(), "app/app/hospitals/network/child-owner-invitation-form.tsx"),
    ];
    const violations = files.filter((file) => derivesFromBrowserOrigin(readFileSync(file, "utf8")));

    expect(violations).toEqual([]);
  });

  it("detects constructed activation URLs while allowing same-origin navigation checks", () => {
    expect(derivesFromBrowserOrigin('const url = `${window.location.origin}/activate/workforce#${token}`')).toBe(true);
    expect(derivesFromBrowserOrigin('const origin = window.location.origin')).toBe(true);
    expect(derivesFromBrowserOrigin('const url = new URL("/activate/workforce", window . location . origin)')).toBe(true);
    expect(derivesFromBrowserOrigin('if (destination.origin === window.location.origin) router.push(path)')).toBe(false);
  });
});
