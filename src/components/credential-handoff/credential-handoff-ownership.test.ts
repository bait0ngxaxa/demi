import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// DESIGN.md "Credential hand-off — one dialog": only the shared kit renders a credential QR on screen or as a file.
// The printed activation slips are a different medium and keep their own server-side rendering.
const ALLOWED = new Set([
  "src/components/credential-handoff/use-credential-qr.ts",
  "app/app/workforce/slips/route.ts",
]);
const QR_FACTORIES = /\bcreateBrandedQr(?:Svg|Png)DataUrl\b/u;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name) && !/\.(?:test|spec)\./u.test(entry.name))
    .map((entry) => relative(process.cwd(), join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
}

describe("credential QR ownership", () => {
  it("keeps branded QR generation inside the shared credential hand-off kit and the slips route", () => {
    const users = ["app", "src"]
      .flatMap((directory) => sourceFiles(join(process.cwd(), directory)))
      .filter((path) => !path.startsWith("src/lib/qr/"))
      .filter((path) => QR_FACTORIES.test(readFileSync(path, "utf8")));

    expect(users.filter((path) => !ALLOWED.has(path))).toEqual([]);
    for (const path of ALLOWED) expect(users, `Stale QR ownership exception: ${path}`).toContain(path);
  });
});
