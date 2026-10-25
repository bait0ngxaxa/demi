import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const example = join(repositoryRoot, ".env.production.example");
const directory = mkdtempSync(join(tmpdir(), "demi-env-check-"));

function check(...args) {
  const result = spawnSync(process.execPath, [join(repositoryRoot, "scripts", "env-check.mjs"), ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "postgresql://shell:shell@127.0.0.1:5432/shell" },
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function variant(name, transform) {
  const path = join(directory, name);
  writeFileSync(path, transform(readFileSync(example, "utf8")));
  return path;
}

const realLike = (text) => text
  .replace(/placeholder-project-ref/gu, "abcdefghijklmnopqrst")
  .replace(/placeholder-db-password/gu, "Sup3rSecretDbPass")
  .replace(/placeholder-region/gu, "ap-southeast-1")
  .replace(/=placeholder-[^\n]*/gu, (match) => `=real-${"x".repeat(40)}-${match.length}`)
  .replace("https://prod-origin.placeholder.invalid", "https://demi.example.org")
  .replace("DEMI_LINE_LOGIN_CHANNEL_ID=0000000000", "DEMI_LINE_LOGIN_CHANNEL_ID=1234567890")
  .replace("NEXT_PUBLIC_DEMI_LINE_LIFF_ID=0000000000-placeholder", "NEXT_PUBLIC_DEMI_LINE_LIFF_ID=1234567890-AbCdEfGh")
  .replace("U00000000000000000000000000000000", "U1234567890abcdef1234567890abcdef");

describe("npm run env:check", () => {
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it("passes on .env.production.example and reports its placeholders", () => {
    const { status, output } = check(example);
    expect(status).toBe(0);
    expect(output).toMatch(/PLACEHOLDER +CORE +DATABASE_URL/u);
    expect(output).toMatch(/placeholder value\(s\) must be replaced/u);
    expect(output).toContain("env:check passed");
  });

  it("fails on the template in --strict mode", () => {
    const { status, output } = check("--strict", example);
    expect(status).toBe(1);
    expect(output).toContain("env:check FAILED");
  });

  it("passes --strict once every placeholder is replaced, without printing any value", () => {
    const path = variant("real.env", realLike);
    const { status, output } = check("--strict", path);
    expect(status).toBe(0);
    expect(output).not.toMatch(/PLACEHOLDER /u);
    for (const secret of ["Sup3rSecretDbPass", "real-xxxx", "abcdefghijklmnopqrst", "U1234567890abcdef"]) {
      expect(output).not.toContain(secret);
    }
  });

  it.each([
    ["DATABASE_URL", /^DATABASE_URL=.*\r?\n/mu, "MISSING +CORE +DATABASE_URL"],
    ["SUPABASE_SERVICE_ROLE_KEY", /^SUPABASE_SERVICE_ROLE_KEY=.*\r?\n/mu, "MISSING +CORE +SUPABASE_SERVICE_ROLE_KEY"],
  ])("fails when required core variable %s is missing, even if the shell defines it", (name, pattern, expected) => {
    const path = variant(`missing-${name}.env`, (text) => text.replace(pattern, ""));
    const { status, output } = check(path);
    expect(status).toBe(1);
    expect(output).toMatch(new RegExp(expected, "u"));
    expect(output).toContain("env:check FAILED");
  });

  it("fails on invalid test override and partial MINI provider configuration", () => {
    const path = variant("invalid.env", (text) => text
      .replace("DEMI_ALLOW_TEST_NATIONAL_IDS=false", "DEMI_ALLOW_TEST_NATIONAL_IDS=TRUE")
      .replace("DEMI_LINE_MINI_APP_CHANNEL_ID=", "DEMI_LINE_MINI_APP_CHANNEL_ID=2234567890"));
    const { status, output } = check(path);
    expect(status).toBe(1);
    expect(output).toMatch(/INVALID +OPTIONAL +DEMI_ALLOW_TEST_NATIONAL_IDS/u);
    expect(output).toMatch(/INVALID +OPTIONAL +DEMI_LINE_MINI_APP_ENVIRONMENT/u);
    expect(output).toMatch(/INVALID +OPTIONAL +DEMI_LINE_MINI_APP_CONTEXT_KEYRING/u);
  });

  it("fails safely when a configured optional LINE Messaging integration is incomplete", () => {
    const path = variant("partial-messaging.env", (text) => text.replace(/^DEMI_LINE_MESSAGING_BOT_USER_ID=.*\r?\n/mu, ""));
    const { status, output } = check(path);
    expect(status).toBe(1);
    expect(output).toMatch(/INVALID +OPTIONAL +DEMI_LINE_MESSAGING_BOT_USER_ID/u);
    expect(output).toContain("env:check FAILED");
  });

  it("accepts the explicit checksum-only National ID override with NODE_ENV=production", () => {
    const path = variant("synthetic-ids.env", (text) => text.replace("DEMI_ALLOW_TEST_NATIONAL_IDS=false", "DEMI_ALLOW_TEST_NATIONAL_IDS=true"));
    const { status, output } = check(path);
    expect(status).toBe(0);
    expect(output).toMatch(/OK +OPTIONAL +DEMI_ALLOW_TEST_NATIONAL_IDS/u);
  });

  it("lists variables DEMI does not read and rejects a missing file", () => {
    const path = variant("legacy.env", (text) => `${text}DEMI_RECOVERY_LINE_ENABLED=true\n`);
    expect(check(path).output).toContain("not read by DEMI (remove): DEMI_RECOVERY_LINE_ENABLED");
    expect(check(join(directory, "absent.env")).status).toBe(1);
    expect(check().status).toBe(1);
  });
});
