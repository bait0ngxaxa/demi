import { readFileSync } from "node:fs";

/** @returns {Record<string, string>} */
export function readCommittedIntegrationEnvironment() {
  const values = {};
  for (const line of readFileSync(new URL("../.env.integration", import.meta.url), "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (match) values[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
  }
  return values;
}

/**
 * Validate before connecting, including when Vitest is invoked without the runner.
 * Only the repository-provisioned disposable database is eligible for destructive tests.
 * @param {Record<string, string | undefined>} environment
 * @returns {string}
 */
export function assertDisposableIntegrationEnvironment(environment) {
  if (environment.NODE_ENV !== "test" || environment.VERCEL_ENV === "production") {
    throw new Error("Integration tests require NODE_ENV=test and a nonproduction environment");
  }
  const committed = readCommittedIntegrationEnvironment();
  const expectedUrl = committed.DEMI_TEST_DATABASE_URL;
  let target;
  try {
    target = new URL(expectedUrl);
  } catch {
    throw new Error("The committed integration environment must contain a valid PostgreSQL URL");
  }
  if (target.protocol !== "postgresql:" || target.hostname !== "127.0.0.1" ||
      target.port !== "55432" || target.pathname !== "/demi_test" || target.username !== "demi_test" ||
      target.search || target.hash) {
    throw new Error("The committed integration environment must target the dedicated demi_test service");
  }
  for (const name of ["DATABASE_URL", "DIRECT_URL", "DEMI_TEST_DATABASE_URL"]) {
    if (committed[name] !== expectedUrl || environment[name] !== expectedUrl) {
      throw new Error(`${name} must match the repository's committed disposable integration target`);
    }
  }
  return expectedUrl;
}

/**
 * @param {Pick<import("@prisma/client").PrismaClient, "$queryRaw">} database
 * @returns {Promise<void>}
 */
export async function assertDisposableIntegrationDatabase(database) {
  /** @type {Array<{ database: string, username: string, schema: string, marker: string | null }>} */
  const targets = await database.$queryRaw`
    SELECT pg_catalog.current_database() AS database, current_user AS username, pg_catalog.current_schema() AS schema,
           pg_catalog.shobj_description(oid, 'pg_database') AS marker
    FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database()
  `;
  const target = targets[0];
  if (targets.length !== 1 || target?.database !== "demi_test" || target.username !== "demi_test" ||
      target.schema !== "public" || target.marker !== "DEMI_DISPOSABLE_INTEGRATION_DATABASE_V1") {
    throw new Error("Integration reset refused: database lacks the Compose-provisioned disposable identity; recreate the integration container");
  }
}
