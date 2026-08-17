import "server-only";

import { z } from "zod";

const postgresUrlSchema = z
  .url()
  .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
    message: "Database connection URL must be a PostgreSQL connection URL",
  });

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: postgresUrlSchema,
    DIRECT_URL: postgresUrlSchema,
    IDENTITY_HASH_SECRET: z.string().trim().min(32),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
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

const patientEvidenceStorageEnvSchema = z.object({
  SUPABASE_PATIENT_EVIDENCE_BUCKET: z.string().trim().min(1).max(100),
});

export type PatientEvidenceStorageEnv = SupabaseAdminEnv & {
  SUPABASE_PATIENT_EVIDENCE_BUCKET: string;
};

let cachedServerEnv: ServerEnv | undefined;
let cachedSupabaseAdminEnv: SupabaseAdminEnv | undefined;
let cachedPatientEvidenceStorageEnv: PatientEvidenceStorageEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const result = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
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

export function getPatientEvidenceStorageEnv(): PatientEvidenceStorageEnv {
  if (cachedPatientEvidenceStorageEnv) {
    return cachedPatientEvidenceStorageEnv;
  }

  const result = patientEvidenceStorageEnvSchema.safeParse({
    SUPABASE_PATIENT_EVIDENCE_BUCKET: process.env.SUPABASE_PATIENT_EVIDENCE_BUCKET,
  });

  if (!result.success) {
    throw new Error("Patient evidence storage environment is not configured correctly");
  }

  cachedPatientEvidenceStorageEnv = {
    ...getSupabaseAdminEnv(),
    SUPABASE_PATIENT_EVIDENCE_BUCKET: result.data.SUPABASE_PATIENT_EVIDENCE_BUCKET,
  };

  return cachedPatientEvidenceStorageEnv;
}
