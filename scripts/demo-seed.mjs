// Synthetic demo dataset (P1 Part C).
//   npm run demo:seed   — remove previous demo data, then create the scenario dated relative to today (Asia/Bangkok)
//   npm run demo:reset  — remove demo data and demo auth users only
// The guard in demo-guard.mjs must pass before anything connects. Output is counts only; logins go to the
// git-ignored .demo-credentials.local.md and the shared password is never written anywhere.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import { createJiti } from "jiti";

import { DemoSeedRefusedError, assertDemoSeedAllowed } from "./demo-guard.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const credentialsPath = resolve(repositoryRoot, ".demo-credentials.local.md");
const MIN_PASSWORD_LENGTH = 12;
// The CLI usually runs far from the database, so each statement costs a network round trip. Domain services that
// do not pass their own limits would otherwise get Prisma's 5 s interactive-transaction default and time out.
const DEMO_TRANSACTION_OPTIONS = { maxWait: 30_000, timeout: 120_000 };
// ApplicationError codes carry fixed messages; Prisma error messages may echo query values, so only their code is shown.
const APPLICATION_ERROR_CODES = new Set(["VALIDATION", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "INFRASTRUCTURE"]);

function loadDotEnv(fileName) {
  const filePath = resolve(repositoryRoot, fileName);
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
  }
}

function writeCredentials(report) {
  const rows = report.accounts.map((account) => `| ${account.role} | \`${account.login}\` | ${account.displayName} |`);
  writeFileSync(credentialsPath, [
    "# DEMI demo accounts (synthetic, local only — do not commit or share)",
    "",
    `โรงพยาบาลแม่ข่าย: ${report.hospitals.parent} · รพ.สต. A: ${report.hospitals.children[0]} · รพ.สต. B: ${report.hospitals.children[1]}`,
    "",
    "เข้าสู่ระบบด้วยเลขบัตรประชาชนสังเคราะห์ด้านล่าง และรหัสผ่านจากตัวแปร `DEMI_DEMO_PASSWORD`",
    "",
    "| บทบาท | Login | ชื่อที่แสดง |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n"), { encoding: "utf8", mode: 0o600 });
}

async function main() {
  const command = process.argv[2];
  if (command !== "seed" && command !== "reset") throw new DemoSeedRefusedError("usage: node scripts/demo-seed.mjs <seed|reset>");

  loadDotEnv(".env");
  loadDotEnv(".env.local");
  const ref = assertDemoSeedAllowed(process.env);
  const password = process.env.DEMI_DEMO_PASSWORD ?? "";
  if (command === "seed" && password.length < MIN_PASSWORD_LENGTH) {
    throw new DemoSeedRefusedError(`DEMI_DEMO_PASSWORD must be set (at least ${MIN_PASSWORD_LENGTH} characters)`);
  }

  // Pre-seed the process-wide client that getPrisma() returns, before any service module is loaded.
  globalThis.demiPrisma = new PrismaClient({ transactionOptions: DEMO_TRANSACTION_OPTIONS });

  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": resolve(repositoryRoot, "src"),
      "server-only": resolve(repositoryRoot, "node_modules", "server-only", "empty.js"),
    },
  });
  const scenario = await jiti.import(resolve(repositoryRoot, "scripts", "demo", "demo-scenario.ts"));
  const { getPrisma } = await jiti.import(resolve(repositoryRoot, "src", "lib", "db", "prisma.ts"));

  console.log(`DEMI demo ${command} → Supabase project ${ref}`);
  try {
    if (command === "reset") {
      const removed = await scenario.resetDemoScenario({});
      console.log("Removed:", removed);
      return;
    }
    const startedAt = Date.now();
    const report = await scenario.seedDemoScenario({
      password,
      parentHospitalCode: process.env.DEMI_DEMO_PARENT_HOSPITAL_CODE || undefined,
      onProgress: (step) => console.log(`[${Math.round((Date.now() - startedAt) / 1000)}s] ${step}`),
    });
    writeCredentials(report);
    console.log("Counts:", report.counts);
    console.log("Verified through report read models:", report.verification);
    console.log(`Logins written to ${credentialsPath}`);
  } finally {
    await getPrisma().$disconnect();
  }
}

try {
  await main();
} catch (error) {
  // Refusals and application errors carry fixed, data-free messages; anything else is reported by type only.
  const code = error instanceof Error && typeof error.code === "string" ? error.code : null;
  const detail = code && APPLICATION_ERROR_CODES.has(code) ? `: ${error.message}` : code ? ` ${code}` : "";
  console.error(error instanceof DemoSeedRefusedError
    ? `Demo seed refused: ${error.message}`
    : `Demo seed failed (${error instanceof Error ? error.name : "unknown error"}${detail}); no credentials were written. Re-run demo:seed — it removes partial demo data first.`);
  process.exitCode = 1;
}
