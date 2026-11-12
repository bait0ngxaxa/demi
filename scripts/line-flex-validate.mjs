import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";
import { createJiti } from "jiti";

/**
 * Operator check, run by hand (never in CI): builds one synthetic sample of
 * every Flex notification type and asks LINE's validate endpoint
 * (POST /v2/bot/message/validate/push) whether it is a valid Push message.
 * Nothing is sent to any user. Prints only pass/fail per message type; no
 * token, URL or provider detail is printed.
 */
const { loadEnvConfig } = nextEnv;
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
loadEnvConfig(repositoryRoot);

const jiti = createJiti(import.meta.url, {
  alias: { "server-only": resolve(repositoryRoot, "node_modules", "server-only", "empty.js") },
  tsconfigPaths: true,
});

try {
  const [{ LINE_FLEX_SAMPLES }, { LineMessagingClient }] = await Promise.all([
    jiti.import(resolve(repositoryRoot, "scripts/line-flex-samples.ts")),
    jiti.import(resolve(repositoryRoot, "src/modules/line/adapters/line-messaging-client.ts")),
  ]);
  const client = new LineMessagingClient();
  let failed = 0;
  for (const sample of LINE_FLEX_SAMPLES) {
    let outcome;
    try {
      outcome = (await client.validatePushMessages([sample.build()])).kind;
    } catch {
      outcome = "BUILD_FAILED";
    }
    if (outcome !== "VALID") failed += 1;
    console.log(`${outcome === "VALID" ? "pass" : "fail"} ${sample.name}${outcome === "VALID" ? "" : ` (${outcome})`}`);
  }
  console.log(failed === 0 ? `line:flex:validate passed (${LINE_FLEX_SAMPLES.length})` : `line:flex:validate FAILED (${failed}/${LINE_FLEX_SAMPLES.length})`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (error) {
  console.error("line:flex:validate FAILED: ตรวจสอบค่า LINE configuration");
  console.error(error instanceof Error ? error.name : "Error");
  process.exitCode = 1;
}
