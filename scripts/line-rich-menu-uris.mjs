import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";
import { createJiti } from "jiti";

/**
 * Read-only: prints the URI actions the Rich Menu catalog would send to LINE
 * with the current environment, so an operator can review Workspace LIFF
 * routing before `line:rich-menu:reconcile`. No network call, no provider or
 * database access. LIFF IDs are public identifiers; no secret is printed.
 */
const { loadEnvConfig } = nextEnv;
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
loadEnvConfig(repositoryRoot);

const jiti = createJiti(import.meta.url, {
  alias: { "server-only": resolve(repositoryRoot, "node_modules", "server-only", "empty.js") },
  tsconfigPaths: true,
});

try {
  const [{ LINE_RICH_MENU_CATALOG }, { createLineRichMenuPayload }] = await Promise.all([
    jiti.import(resolve(repositoryRoot, "src/modules/line/rich-menu/catalog.ts")),
    jiti.import(resolve(repositoryRoot, "src/modules/line/adapters/line-messaging-client.ts")),
  ]);
  const counts = { workspaceLiff: 0, otherLiff: 0, ordinaryWeb: 0 };
  for (const menu of LINE_RICH_MENU_CATALOG) {
    console.log(`${menu.key} (alias ${menu.alias})`);
    for (const { action } of createLineRichMenuPayload(menu).areas) {
      if (action.type !== "uri") {
        console.log(`  ${action.type.padEnd(14)} ${action.label}`);
        continue;
      }
      const workspace = process.env.NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID?.trim();
      const kind = action.uri.startsWith("https://liff.line.me/")
        ? workspace && action.uri.startsWith(`https://liff.line.me/${workspace}`) ? "workspaceLiff" : "otherLiff"
        : "ordinaryWeb";
      counts[kind] += 1;
      console.log(`  ${"uri".padEnd(14)} ${action.label} -> ${action.uri} [${kind}]`);
    }
  }
  console.log(`URI actions: Workspace LIFF ${counts.workspaceLiff}, Account LIFF ${counts.otherLiff}, ordinary web ${counts.ordinaryWeb}`);
} catch (error) {
  console.error("ไม่สามารถสร้างรายการ URI ของ Rich Menu ได้ กรุณาตรวจสอบค่า LINE configuration");
  console.error(error instanceof Error ? error.name : "Error");
  process.exitCode = 1;
}
