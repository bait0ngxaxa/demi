import "server-only";

import { z } from "zod";

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEMI_DATABASE_TARGET: z.enum(["development", "test", "staging", "production"]),
    DATABASE_URL: z
      .url()
      .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
        message: "DATABASE_URL must be a PostgreSQL connection URL",
      }),
    IDENTITY_HASH_SECRET: z.string().trim().min(32),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
  })
  .superRefine((value, context) => {
    if (
      (value.NODE_ENV === "development" || value.NODE_ENV === "test") &&
      value.DEMI_DATABASE_TARGET === "production"
    ) {
      context.addIssue({
        code: "custom",
        path: ["DEMI_DATABASE_TARGET"],
        message: "Development and test processes cannot target the production database",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const supabaseAdminEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  })
  .refine(
    (value) => value.SUPABASE_SERVICE_ROLE_KEY !== value.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      path: ["SUPABASE_SERVICE_ROLE_KEY"],
      message: "Supabase administration requires a privileged server credential",
    },
  );

export type SupabaseAdminEnv = Pick<
  z.infer<typeof supabaseAdminEnvSchema>,
  "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"
>;

let cachedServerEnv: ServerEnv | undefined;
let cachedSupabaseAdminEnv: SupabaseAdminEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const result = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DEMI_DATABASE_TARGET: process.env.DEMI_DATABASE_TARGET,
    DATABASE_URL: process.env.DATABASE_URL,
    IDENTITY_HASH_SECRET: process.env.IDENTITY_HASH_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) {
    throw new Error("Server environment is not configured correctly");
  }

  cachedServerEnv = result.data;
  return cachedServerEnv;
}

export function getSupabaseAdminEnv(): SupabaseAdminEnv {
  if (cachedSupabaseAdminEnv) {
    return cachedSupabaseAdminEnv;
  }

  const result = supabaseAdminEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) {
    throw new Error("Supabase administration environment is not configured correctly");
  }

  cachedSupabaseAdminEnv = {
    NEXT_PUBLIC_SUPABASE_URL: result.data.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: result.data.SUPABASE_SERVICE_ROLE_KEY,
  };
  return cachedSupabaseAdminEnv;
}
