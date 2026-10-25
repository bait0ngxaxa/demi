import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { createJiti } from "jiti";

// Validates an env file with the server's own schemas (src/lib/env/deployment-environment.ts).
// Prints variable names and statuses only, never values.
// Usage: npm run env:check -- [--strict] <env-file>
//   --strict  also fails while any placeholder value remains (use before a deploy).

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function parseArguments(args) {
  const strict = args.includes("--strict");
  const files = args.filter((argument) => argument !== "--strict");
  if (files.length !== 1 || files[0].startsWith("--")) {
    throw new Error("usage: npm run env:check -- [--strict] <env-file>");
  }
  return { strict, file: resolve(files[0]) };
}

async function main() {
  const { strict, file } = parseArguments(process.argv.slice(2));
  if (!existsSync(file)) throw new Error("env file not found");
  // Same parser as `node --env-file`, which PM2, systemd and the deploy commands use.
  const values = parseEnv(readFileSync(file, "utf8"));

  const jiti = createJiti(import.meta.url, {
    alias: { "server-only": resolve(repositoryRoot, "node_modules", "server-only", "empty.js") },
    tsconfigPaths: true,
  });
  const { checkDeploymentEnvironment, DEPLOYMENT_ENVIRONMENT_VARIABLES } = await jiti.import(
    resolve(repositoryRoot, "src/lib/env/deployment-environment.ts"),
  );

  // Evaluate exactly the file: nothing from this shell may satisfy a variable.
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, values);

  const report = checkDeploymentEnvironment("production");
  for (const { name, group, status } of report.variables) {
    console.log(`${status.padEnd(11)} ${group.padEnd(10)} ${name}`);
  }
  console.log("");
  const unknown = Object.keys(values).filter((name) => !DEPLOYMENT_ENVIRONMENT_VARIABLES.includes(name));
  if (unknown.length > 0) console.log(`\nnot read by DEMI (remove): ${unknown.join(", ")}`);

  const failed = !report.valid || (strict && report.placeholders.length > 0);
  if (report.placeholders.length > 0) {
    console.log(`\n${report.placeholders.length} placeholder value(s) must be replaced before deploying${strict ? "" : " (use --strict to fail on them)"}`);
  }
  console.log(failed ? "\nenv:check FAILED" : "\nenv:check passed");
  process.exitCode = failed ? 1 : 0;
}

try {
  await main();
} catch (error) {
  console.error(`env:check FAILED: ${error instanceof Error ? error.message : "unexpected error"}`);
  process.exitCode = 1;
}
