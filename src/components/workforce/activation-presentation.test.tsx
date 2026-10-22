import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
    const violations = files.filter((file) => /window\s*\.\s*location\s*\.\s*origin/u.test(readFileSync(file, "utf8")));

    expect(violations).toEqual([]);
  });
});
