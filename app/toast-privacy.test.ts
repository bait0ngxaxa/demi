import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const appRoot = join(process.cwd(), "app");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** The text between the bracket at `open` and its matching close bracket (string literals are not special-cased). */
function balanced(source: string, open: number): string {
  const pairs: Record<string, string> = { "(": ")", "{": "}" };
  const close = pairs[source[open]];
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === source[open]) depth += 1;
    if (source[index] === close) depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unbalanced ${source[open]} at ${open}`);
}

const stringLiteral = /"([^"\\]*)"/g;

function literals(expression: string): string[] {
  return [...expression.matchAll(stringLiteral)].map((match) => match[1]);
}

/** The expression with every string literal replaced by `S` and whitespace collapsed. */
function skeleton(expression: string): string {
  return expression.replace(stringLiteral, "S").replace(/\s+/g, " ").trim().replace(/,$/, "");
}

// A Toast argument is a literal, a ternary between literals on a plain discriminant, or one of these reviewed static tables.
const allowedSkeletons = [/^S$/, /^[\w.]+(?: === S)? \? S : S$/];
const reviewedReferences = [
  /^copy\.(success|conflict|forbidden)$/,
  /^assignmentToasts\[result\.result\.operation\]$/,
  /^(conflictToastMessage|notFoundToastMessage)$/,
  /^notice\.message$/,
];

type Found = { file: string; expression: string };

function notifyArguments(): Found[] {
  const found: Found[] = [];
  for (const file of sourceFiles(appRoot)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/notify(?:\.(?:success|warning|error|info)|\[notice\.level\])\(/g)) {
      found.push({ file: relative(appRoot, file), expression: balanced(source, match.index + match[0].length - 1) });
    }
  }
  return found;
}

/** Static notice tables that feed `notify[notice.level](notice.message)` and the Patient edit copy. */
function noticeTables(): Found[] {
  const found: Found[] = [];
  for (const file of sourceFiles(appRoot)) {
    const source = readFileSync(file, "utf8");
    const openers = [
      ...[...source.matchAll(/\{\s*level:/g)].map((match) => match.index),
      ...[...source.matchAll(/standardNotice\(/g)].map((match) => match.index + match[0].length - 1),
      ...[...source.matchAll(/(?:Refusals|Toasts|copy) = \{/g)].map((match) => match.index + match[0].length - 1),
      ...[...source.matchAll(/usePatientEditAction\(/g)].map((match) => match.index + match[0].length - 1),
    ];
    for (const open of openers) {
      found.push({ file: relative(appRoot, file), expression: balanced(source, open) });
    }
  }
  return found;
}

function expectSafeCopy(message: string, where: string): void {
  expect(message, where).toMatch(/^[\u0E00-\u0E7F .-]+$/);
  expect(message.length, where).toBeLessThanOrEqual(80);
}

describe("Toast copy across the application", () => {
  const calls = notifyArguments();
  const tables = noticeTables();

  it("finds the Toast calls and notice tables of every integrated workflow", () => {
    expect(calls.length).toBeGreaterThan(50);
    expect(new Set(calls.map(({ file }) => file.split(/[\\/]/)[1])).size).toBeGreaterThanOrEqual(6);
    expect(tables.length).toBeGreaterThan(15);
  });

  it("only passes reviewed static copy: no interpolation, no values from results, forms or errors", () => {
    for (const { file, expression } of calls) {
      const shape = skeleton(expression);
      const allowed =
        allowedSkeletons.some((pattern) => pattern.test(shape)) || reviewedReferences.some((pattern) => pattern.test(shape));
      expect(allowed, `${file}: ${expression}`).toBe(true);
    }
  });

  it("keeps notice tables free of interpolation and of server or form messages", () => {
    for (const { file, expression } of tables) {
      expect(expression, file).not.toContain("`");
      expect(expression, file).not.toMatch(/\.\s*message\b(?!\s*:)/);
      expect(expression, file).not.toMatch(/"\s*\+|\+\s*"/);
    }
  });

  it("keeps all Toast copy short, Thai and free of identifiers, digits or mojibake", () => {
    // A ternary's condition literal is a discriminant, not copy; only its two branches are shown.
    const fromCalls = calls.flatMap(({ file, expression }) =>
      literals(expression).slice(skeleton(expression) === "S" ? 0 : -2).map((message) => ({ file, message })),
    );
    const fromTables = tables.flatMap(({ file, expression }) =>
      literals(expression)
        .filter((value) => !/^[A-Z_]+$|^(success|warning|error)$/.test(value))
        .map((message) => ({ file, message })),
    );
    const messages = [...fromCalls, ...fromTables];
    expect(messages.length).toBeGreaterThan(60);
    for (const { file, message } of messages) {
      expectSafeCopy(message, `${file}: ${message}`);
    }
  });
});
