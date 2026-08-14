Object.assign(process.env, { NODE_ENV: process.env.NODE_ENV ?? "test" });
process.env.DATABASE_URL ??= "postgresql://postgres:password@localhost:5432/demi_test";
process.env.DIRECT_URL ??= "postgresql://postgres:password@localhost:5432/demi_test";
process.env.IDENTITY_HASH_SECRET ??= "test-only-identity-hash-secret-32-characters";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
