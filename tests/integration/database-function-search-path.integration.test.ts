import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";

const database = getPrisma();

describe("public database functions", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Verified local disposable PostgreSQL required");
    await database.$connect();
  });
  afterAll(async () => { await database.$disconnect(); });

  // Supabase advisor function_search_path_mutable: every function DEMI owns in public pins its search_path.
  it("pins search_path on every function in public", async () => {
    const functions = await database.$queryRaw<Array<{ name: string; config: string[] | null }>>`
      SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS "name", p.proconfig AS "config"
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      ORDER BY 1
    `;
    expect(functions.length).toBeGreaterThan(0);
    const unpinned = functions.filter(({ config }) => !(config ?? []).some((setting) => setting.startsWith("search_path=")));
    expect(unpinned.map(({ name }) => name)).toEqual([]);
  });
});
