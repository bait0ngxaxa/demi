import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = path.resolve(process.cwd(), "src");

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listTypeScriptFiles(entryPath);
      }

      return /\.tsx?$/u.test(entry.name) ? [entryPath] : [];
    }),
  );

  return nestedFiles.flat();
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((item) => item.kind === kind));
}

function isAsyncFunctionValue(node: ts.Node | undefined): boolean {
  if (!node || (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node))) {
    return false;
  }

  return hasModifier(node, ts.SyntaxKind.AsyncKeyword);
}

function isUseServerModule(sourceFile: ts.SourceFile): boolean {
  const firstStatement = sourceFile.statements[0];

  return Boolean(
    firstStatement &&
      ts.isExpressionStatement(firstStatement) &&
      ts.isStringLiteral(firstStatement.expression) &&
      firstStatement.expression.text === "use server",
  );
}

function getInvalidRuntimeExports(sourceFile: ts.SourceFile): string[] {
  const invalidExports: string[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (!statement.isTypeOnly) {
        invalidExports.push("runtime re-export");
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      if (!isAsyncFunctionValue(statement.expression)) {
        invalidExports.push("default export");
      }
      continue;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      if (!hasModifier(statement, ts.SyntaxKind.AsyncKeyword)) {
        invalidExports.push(statement.name?.text ?? "default function");
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!isAsyncFunctionValue(declaration.initializer)) {
          invalidExports.push(declaration.name.getText(sourceFile));
        }
      }
      continue;
    }

    if (
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)
    ) {
      invalidExports.push(statement.name?.getText(sourceFile) ?? "runtime declaration");
    }
  }

  return invalidExports;
}

describe('top-level "use server" module contract', () => {
  it("exports only async functions at runtime", async () => {
    const sourceFiles = await listTypeScriptFiles(SOURCE_ROOT);
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const sourceText = await readFile(filePath, "utf8");
      const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      if (!isUseServerModule(sourceFile)) {
        continue;
      }

      const invalidExports = getInvalidRuntimeExports(sourceFile);

      if (invalidExports.length > 0) {
        violations.push(
          `${path.relative(SOURCE_ROOT, filePath)}: ${invalidExports.join(", ")}`,
        );
      }
    }

    expect(violations).toEqual([]);
  }, 15_000);
});
