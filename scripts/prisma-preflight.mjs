import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const allowedTargets = new Set(["development", "test", "staging", "production"]);
const operation = process.argv[2];
const inheritedEnvironmentKeys = new Set(Object.keys(process.env));

function loadDotEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);

    if (!match || inheritedEnvironmentKeys.has(match[1])) {
      continue;
    }

    const value = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
    process.env[match[1]] = value;
  }
}

loadDotEnvFile(".env");
loadDotEnvFile(".env.local");

const target = process.env.DEMI_DATABASE_TARGET;
const nodeEnvironment = process.env.NODE_ENV ?? "development";
const databaseUrl = process.env.DATABASE_URL;

function fail(message) {
  console.error(`Prisma safety preflight failed: ${message}`);
  process.exit(1);
}

if (!operation) {
  fail("an operation name is required");
}

if (!target || !allowedTargets.has(target)) {
  fail("DEMI_DATABASE_TARGET must explicitly be development, test, staging, or production");
}

if (!databaseUrl || !/^postgres(?:ql)?:\/\//u.test(databaseUrl)) {
  fail("DATABASE_URL must be a PostgreSQL URL");
}

if (operation === "migrate-dev" || operation === "db-push" || operation === "migrate-reset") {
  if (target === "production") {
    fail(`${operation} cannot target a production database`);
  }

  if (nodeEnvironment === "production") {
    fail(`${operation} cannot run with NODE_ENV=production`);
  }
}

if (operation === "migrate-deploy" && target === "production" && nodeEnvironment !== "production") {
  fail("production migrate deploy requires NODE_ENV=production");
}

if (operation === "test-integration") {
  if (target !== "test" || nodeEnvironment === "production") {
    fail("integration tests require NODE_ENV other than production and DEMI_DATABASE_TARGET=test");
  }

  if (!process.env.DEMI_TEST_DATABASE_URL) {
    fail("DEMI_TEST_DATABASE_URL must identify the dedicated integration-test database");
  }

  if (process.env.DEMI_TEST_DATABASE_URL !== databaseUrl) {
    fail("DATABASE_URL must equal DEMI_TEST_DATABASE_URL during integration tests");
  }
}
