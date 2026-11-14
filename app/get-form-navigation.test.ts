import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// A native GET <form> makes the browser load a new document. Inside LINE every document request goes through the
// Workspace LIFF bootstrap ("กำลังเปิด DEMI"), so search and filter forms must use `Form` from next/form, which
// navigates client-side. A real document load still takes the bootstrap path.

const roots = ["app", "src"].map((directory) => join(process.cwd(), directory));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx") && !/\.test\./.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** The attribute text of the JSX opening tag that starts at `start`, skipping `>` inside `{…}` and string literals. */
function openingTagAttributes(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'" || character === "`") quote = character;
    else if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    else if (character === ">" && depth === 0) return source.slice(start, index);
  }
  throw new Error(`Unterminated <form> tag at ${start}`);
}

/** A native `<form>` submits as GET when its method is get, or when it has no method and a plain string action. */
function isNativeGetForm(attributes: string): boolean {
  const method = /\bmethod\s*=\s*(?:\{\s*)?["'`]([^"'`]*)["'`]/u.exec(attributes);
  if (method) return method[1].toLowerCase() === "get";
  if (/\bmethod\s*=/u.test(attributes)) return true; // A computed method may be get; review it as a Form instead.
  return /\baction\s*=\s*(?:\{\s*)?["'`]/u.test(attributes);
}

function nativeGetForms(source: string): number[] {
  return [...source.matchAll(/<form(?=[\s>])/gu)]
    .filter((match) => isNativeGetForm(openingTagAttributes(source, match.index + "<form".length)))
    .map((match) => source.slice(0, match.index).split("\n").length);
}

describe("GET forms navigate client-side", () => {
  it("recognises native GET forms and leaves server-action and POST forms alone", () => {
    expect(nativeGetForms('<form action="/app/appointments" method="get">')).toEqual([1]);
    expect(nativeGetForms("<form\n  className=\"x\"\n  method='GET'\n>")).toEqual([1]);
    expect(nativeGetForms('<form method={"get"} onSubmit={(event) => event.preventDefault()}>')).toEqual([1]);
    expect(nativeGetForms('<form action="/search">')).toEqual([1]);
    expect(nativeGetForms('<Form action="/app/appointments">')).toEqual([]);
    expect(nativeGetForms("<form action={formAction} onSubmit={(event) => submit(event)}>")).toEqual([]);
    expect(nativeGetForms('<form action="/app/workforce/slips" method="post" target="_blank">')).toEqual([]);
    expect(nativeGetForms("<formatted-value />")).toEqual([]);
  });

  it("has no native GET <form> in app/ or src/", () => {
    const offenders = roots.flatMap((root) => sourceFiles(root).flatMap((file) =>
      nativeGetForms(readFileSync(file, "utf8")).map((line) => `${relative(process.cwd(), file)}:${line}`)));

    expect(offenders, "Native GET <form> loads a new document (the Workspace LIFF \"กำลังเปิด DEMI\" screen inside LINE). "
      + "Use `import Form from \"next/form\"` with a string action instead; it navigates client-side.").toEqual([]);
  });
});
