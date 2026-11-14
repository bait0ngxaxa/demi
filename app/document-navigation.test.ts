import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// DESIGN.md: explicit credential/LIFF handoffs, never a blanket exception for ordinary app UI.
const allowedFiles = new Map([
  ["app/workspace-liff-entry.tsx", "LIFF entry and bootstrap fallback"],
  ["app/line/workflow/line-workflow-client.tsx", "LINE workflow document gateway"],
  ["app/line/workflow/appointments/layout.tsx", "Full-document exit from scoped LINE workflow to ordinary DEMI"],
  ["app/line/account/line-account-client.tsx", "LINE account credential handoff"],
  ["app/line/account/line-recovery-panel.tsx", "Account recovery in the Account LIFF"],
  ["app/app/workforce/workforce-new-workspace.tsx", "Workforce activation credential handoff"],
  ["app/app/workforce/[kind]/[relationshipId]/workforce-activation-control.tsx", "Workforce activation credential handoff"],
  ["app/app/users/mediated-password-reset-control.tsx", "Mediated password-reset credential handoff"],
  ["app/app/patients/activation/patient-activation-actions-workspace.tsx", "Patient activation credential handoff"],
  ["src/components/workforce/activation-presentation.tsx", "Activation one-time result navigation"],
  ["app/app/hospitals/network/child-owner-invitation-form.tsx", "Child owner activation credential handoff"],
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name)
      && !/\.(?:test|spec)\./u.test(entry.name)
      && !/(?:^|[/\\])(?:__tests__|tests)(?:[/\\]|$)/u.test(entry.parentPath))
    .map((entry) => join(entry.parentPath, entry.name));
}

function isLocationProperty(node: ts.Node, name: string): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === name
    && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "location"
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "window";
}

function startsWithAppPath(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node)) return startsWithAppPath(node.expression);
  if (ts.isStringLiteralLike(node)) return /^\/app(?:[/\?#]|$)/u.test(node.text);
  if (ts.isTemplateExpression(node)) return /^\/app(?:[/\?#]|$)/u.test(node.head.text);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return startsWithAppPath(node.left);
  if (ts.isConditionalExpression(node)) return startsWithAppPath(node.whenTrue) || startsWithAppPath(node.whenFalse);
  return false;
}

function documentNavigations(source: string, filename = "fixture.tsx"): number[] {
  if (!/<a(?=[\s/>])|window\s*\.\s*location/u.test(source)) return [];
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const lines = new Set<number>();
  function visit(node: ts.Node): void {
    let forbidden = false;
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === "a") {
      forbidden = node.attributes.properties.some((attribute) => {
        if (!ts.isJsxAttribute(attribute) || attribute.name.getText(file) !== "href" || !attribute.initializer) return false;
        const value = ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : attribute.initializer;
        return value !== undefined && startsWithAppPath(value);
      });
    } else if (ts.isCallExpression(node)) {
      // Include computed destinations: a local variable can resolve to an /app path at runtime.
      forbidden = isLocationProperty(node.expression, "assign") || isLocationProperty(node.expression, "replace");
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      forbidden = isLocationProperty(node.left, "href");
    }
    if (forbidden) lines.add(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...lines];
}

describe("document navigation to app routes", () => {
  it.each([
    '<a href="/app/personal/knowledge">open</a>',
    "<a\n onClick={() => work()}\n href={'/app?tab=personal'} />",
    '<a href={`/app/personal/${id}`} />',
    '<a href={"/app/" + id} />',
    '<a href={ready ? "/app" : "/login"} />',
    'window.location.assign(destination)',
    'window . location . replace("/app")',
    'window.location.href = destination',
  ])("detects %s", (source) => {
    expect(documentNavigations(source)).not.toEqual([]);
  });

  it("ignores Link, comments, hash links, downloads outside /app and location reads", () => {
    expect(documentNavigations(`
      // window.location.assign("/app")
      const current = window.location.href;
      const content = <><Link href="/app" /><a href="#meal" /><a download href="/api/export" /><a href="/application" /></>;
    `)).toEqual([]);
    expect(documentNavigations('window.location.replace(path)', "fixture.ts")).toEqual([1]);
    expect(documentNavigations('<a\n href="/app" />')).toEqual([1]);
  });

  it("has only explicitly allowed document navigations in app/ and src/", () => {
    const files = ["app", "src"].flatMap((directory) => sourceFiles(join(process.cwd(), directory)));
    const offenders = files.flatMap((file) => {
      const path = relative(process.cwd(), file).replaceAll("\\", "/");
      if (allowedFiles.has(path)) return [];
      return documentNavigations(readFileSync(file, "utf8"), file).map((line) => `${path}:${line}`);
    });
    expect(offenders, "Document navigation restarts the Workspace LIFF document (กำลังเปิด DEMI). "
      + "Follow DESIGN.md: use Link, next/form or router.push/replace/refresh; keep only explicit LIFF/credential handoffs.").toEqual([]);
    const paths = new Set(files.map((file) => relative(process.cwd(), file).replaceAll("\\", "/")));
    for (const file of allowedFiles.keys()) expect(paths.has(file), `Stale DESIGN.md navigation exception: ${file}`).toBe(true);
  });
});
