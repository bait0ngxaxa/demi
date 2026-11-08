import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const emptyHome = mkdtempSync(join(tmpdir(), "demi-rich-menu-uris-"));

function run(overrides) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith("DEMI_") || name.startsWith("NEXT_PUBLIC_DEMI_")) delete env[name];
  const result = spawnSync(process.execPath, [join(repositoryRoot, "scripts", "line-rich-menu-uris.mjs")], {
    cwd: repositoryRoot,
    encoding: "utf8",
    // Explicit values override any developer .env file loaded by @next/env.
    env: {
      ...env,
      HOME: emptyHome,
      DEMI_LINE_LOGIN_CHANNEL_ID: "1234567890",
      DEMI_LINE_PUBLIC_ORIGIN: "https://demi.example.org",
      IDENTITY_HASH_SECRET: "line-test-identity-hash-secret-at-least-32",
      NEXT_PUBLIC_DEMI_LINE_LIFF_ID: "1234567890-Account",
      DEMI_LINE_MINI_APP_LIFF_ID: "",
      ...overrides,
    },
    timeout: 120_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("npm run line:rich-menu:uris", () => {
  afterAll(() => rmSync(emptyHome, { recursive: true, force: true }));

  it("lists ordinary web URIs before the Workspace LIFF is configured", () => {
    const { status, output } = run({ NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID: "" });
    expect(status).toBe(0);
    expect(output).toContain("https://demi.example.org/app/personal/wellness [ordinaryWeb]");
    expect(output).toMatch(/URI actions: Workspace LIFF 0, Account LIFF \d+, ordinary web [1-9]\d*/u);
  });

  it("lists Workspace LIFF URIs once configured and keeps Account on its own LIFF", () => {
    const { status, output } = run({ NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID: "1234567890-WorkSpace" });
    expect(status).toBe(0);
    expect(output).toContain("https://liff.line.me/1234567890-WorkSpace/app/personal/wellness [workspaceLiff]");
    expect(output).toContain("https://liff.line.me/1234567890-Account [otherLiff]");
    expect(output).toMatch(/URI actions: Workspace LIFF [1-9]\d*, Account LIFF [1-9]\d*, ordinary web 0/u);
    expect(output).not.toContain("line-test-identity-hash-secret");
  });
});
