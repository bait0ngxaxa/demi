import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";
import { createJiti } from "jiti";

const { loadEnvConfig } = nextEnv;

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
loadEnvConfig(repositoryRoot);

function parseArguments(args) {
  const options = { apply: false, repair: false, limit: 50, after: null };
  for (const argument of args) {
    if (argument === "--apply") options.apply = true;
    else if (argument === "--repair") options.repair = true;
    else if (argument.startsWith("--limit=")) {
      const value = Number(argument.slice("--limit=".length));
      if (!Number.isInteger(value) || value < 1 || value > 200) {
        throw new Error("--limit ต้องเป็นจำนวนเต็มระหว่าง 1 ถึง 200");
      }
      options.limit = value;
    } else if (argument.startsWith("--after=")) {
      const value = argument.slice("--after=".length);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
        throw new Error("--after ต้องเป็นรหัสรายการรูปแบบ UUID");
      }
      options.after = value;
    } else {
      throw new Error("ตัวเลือกไม่ถูกต้อง ใช้ --apply, --repair, --limit=1..200 และ --after=<UUID>");
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const jiti = createJiti(import.meta.url, {
    alias: { "server-only": resolve(repositoryRoot, "node_modules", "server-only", "empty.js") },
    tsconfigPaths: true,
  });
  if (options.repair) {
    const [{ getPrisma }, { LineProviderCleanupState }] = await Promise.all([
      jiti.import(resolve(repositoryRoot, "src/lib/db/prisma.ts")),
      import("@prisma/client"),
    ]);
    const database = getPrisma();
    try {
      const unresolvedCleanup = [
        LineProviderCleanupState.PENDING,
        LineProviderCleanupState.MISMATCH,
        LineProviderCleanupState.UNAVAILABLE,
        LineProviderCleanupState.UNKNOWN,
      ];
      const query = {
        where: {
          ...(options.after ? { id: { gt: options.after } } : {}),
          OR: [
            { unlinkedAt: null },
            { unlinkedAt: { not: null }, providerCleanupState: { in: unresolvedCleanup } },
          ],
        },
        orderBy: { id: "asc" },
        take: options.limit,
        select: { id: true },
      };
      const bindings = await database.lineAccountBinding.findMany(query);
      if (!options.apply) {
        const next = bindings.length === options.limit ? `; ดำเนินการต่อด้วย --after=${bindings.at(-1)?.id}` : "";
        console.log(`ตรวจพบรายการที่เข้าเงื่อนไข ${bindings.length} รายการ (จำกัด ${options.limit}); ยังไม่ได้เปลี่ยนข้อมูล${next}`);
        return;
      }
      const { reconcileLineBindingIds } = await jiti.import(resolve(repositoryRoot, "src/modules/line/services/line-menu-reconciler.ts"));
      const result = await reconcileLineBindingIds(bindings.map(({ id }) => id));
      const reconciledBindings = await database.lineAccountBinding.findMany({
        where: { id: { in: bindings.map(({ id }) => id) } },
        select: { unlinkedAt: true, menuSyncState: true, providerCleanupState: true },
      });
      const outcomeCounts = new Map();
      for (const binding of reconciledBindings) {
        const state = binding.unlinkedAt
          ? binding.providerCleanupState ?? "UNKNOWN"
          : binding.menuSyncState;
        outcomeCounts.set(state, (outcomeCounts.get(state) ?? 0) + 1);
      }
      const outcomeSummary = [...outcomeCounts].map(([state, count]) => `${state}:${count}`).join(", ") || "ไม่มีรายการ";
      const next = bindings.length === options.limit ? `; ดำเนินการต่อด้วย --after=${bindings.at(-1)?.id}` : "";
      console.log(`ตรวจสอบ ${result.reconciled} รายการ; สถานะ ${outcomeSummary}; รอ lease ${result.busy}; ไม่พบรายการ ${result.missing}${next}`);
    } finally {
      await database.$disconnect();
    }
    return;
  }

  const { reconcileLineRichMenuCatalog } = await jiti.import(resolve(repositoryRoot, "src/modules/line/rich-menu/line-menu-provisioning-service.ts"));
  const result = await reconcileLineRichMenuCatalog({ apply: options.apply });
  const action = options.apply ? "ดำเนินการแล้ว" : "แผนการดำเนินการ (dry-run)";
  console.log(`${action}: เมนู ${result.expectedMenus}, สร้าง ${result.createdMenus}, ใช้ซ้ำ ${result.reusedMenus}, อัปโหลดภาพ ${result.uploadedImages}, สร้าง alias ${result.createdAliases}, ปรับ alias ${result.updatedAliases}, เปลี่ยนเมนูเริ่มต้น ${result.defaultMenuUpdated ? "ใช่" : "ไม่"}`);
}

try {
  await main();
} catch (error) {
  console.error("คำสั่ง LINE Rich Menu ไม่สำเร็จ");
  console.error(
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : error,
  );

  if (error && typeof error === "object" && "code" in error) {
    console.error("Code:", error.code);
  }

  process.exitCode = 1;
}
