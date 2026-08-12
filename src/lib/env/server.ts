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

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const result = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DEMI_DATABASE_TARGET: process.env.DEMI_DATABASE_TARGET,
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) {
    throw new Error("Server environment is not configured correctly");
  }

  cachedServerEnv = result.data;
  return cachedServerEnv;
}
