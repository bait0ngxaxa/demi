import { describe, expect, it } from "vitest";

import { assertDemoSeedAllowed, supabaseRefFromApiUrl, supabaseRefFromDatabaseUrl } from "./demo-guard.mjs";

const REF = "jfsbcqpllvwzmkrmclgw";
const OTHER = "abcdefghijklmnopqrst";
const allowed = {
  DEMI_DEMO_SEED_ALLOWED: "true",
  DEMI_DEMO_SUPABASE_REF: REF,
  DATABASE_URL: `postgresql://postgres.${REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`,
  DIRECT_URL: `postgresql://postgres:secret@db.${REF}.supabase.co:5432/postgres`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
};

describe("demo seed guard", () => {
  it("allows only the allowlisted demo project", () => {
    expect(assertDemoSeedAllowed(allowed)).toBe(REF);
  });

  it("refuses without the explicit flag", () => {
    expect(() => assertDemoSeedAllowed({ ...allowed, DEMI_DEMO_SEED_ALLOWED: undefined })).toThrow("DEMI_DEMO_SEED_ALLOWED");
    expect(() => assertDemoSeedAllowed({ ...allowed, DEMI_DEMO_SEED_ALLOWED: "1" })).toThrow("DEMI_DEMO_SEED_ALLOWED");
  });

  it("refuses a database or API URL outside the allowlisted ref", () => {
    expect(() => assertDemoSeedAllowed({ ...allowed, DATABASE_URL: allowed.DATABASE_URL.replace(REF, OTHER) })).toThrow("DATABASE_URL");
    expect(() => assertDemoSeedAllowed({ ...allowed, DIRECT_URL: allowed.DIRECT_URL.replace(REF, OTHER) })).toThrow("DIRECT_URL");
    expect(() => assertDemoSeedAllowed({ ...allowed, NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER}.supabase.co` })).toThrow("NEXT_PUBLIC_SUPABASE_URL");
    expect(() => assertDemoSeedAllowed({ ...allowed, DEMI_DEMO_SUPABASE_REF: OTHER })).toThrow("DATABASE_URL");
    expect(() => assertDemoSeedAllowed({ ...allowed, DEMI_DEMO_SUPABASE_REF: undefined })).toThrow("DEMI_DEMO_SUPABASE_REF");
    expect(() => assertDemoSeedAllowed({ ...allowed, DATABASE_URL: "postgresql://demi:pw@127.0.0.1:5432/demi_test" })).toThrow("DATABASE_URL");
  });

  it("refuses any production marker even when the ref matches", () => {
    for (const name of ["NODE_ENV", "VERCEL_ENV", "DEMI_DEPLOYMENT_STAGE", "DEMI_LINE_MINI_APP_ENVIRONMENT"]) {
      expect(() => assertDemoSeedAllowed({ ...allowed, [name]: "production" })).toThrow(name);
    }
  });

  it("never echoes credentials in a refusal", () => {
    try {
      assertDemoSeedAllowed({ ...allowed, DATABASE_URL: allowed.DATABASE_URL.replace(REF, OTHER) });
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });

  it("parses refs from Supabase direct, pooler and API URLs only", () => {
    expect(supabaseRefFromDatabaseUrl(allowed.DATABASE_URL)).toBe(REF);
    expect(supabaseRefFromDatabaseUrl(allowed.DIRECT_URL)).toBe(REF);
    expect(supabaseRefFromDatabaseUrl(`postgresql://postgres.${REF}:x@evil.example.com:5432/postgres`)).toBeNull();
    expect(supabaseRefFromDatabaseUrl("not a url")).toBeNull();
    expect(supabaseRefFromApiUrl(`https://${REF}.supabase.co`)).toBe(REF);
    expect(supabaseRefFromApiUrl(`http://${REF}.supabase.co`)).toBeNull();
  });
});
