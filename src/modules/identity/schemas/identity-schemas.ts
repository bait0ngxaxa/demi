import { z } from "zod";

const optionalPersonName = z.string().trim().min(1).max(120).optional();

export const THAI_NATIONAL_IDENTITY_NAMESPACE = "thai-national-id";
export const TEST_NATIONAL_ID_ENVIRONMENT_VARIABLE = "DEMI_ALLOW_TEST_NATIONAL_IDS";

export type IdentityEnvironment = {
  nodeEnv?: string;
  allowTestNationalIds?: string;
};

function isTestEnvironment(nodeEnv: string | undefined): boolean {
  return nodeEnv === "development" || nodeEnv === "test";
}

export function isTestNationalIdBypassEnabled(
  environment: IdentityEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    allowTestNationalIds: process.env[TEST_NATIONAL_ID_ENVIRONMENT_VARIABLE],
  },
): boolean {
  return (
    isTestEnvironment(environment.nodeEnv) &&
    environment.allowTestNationalIds === "true"
  );
}

function hasValidThaiNationalIdChecksum(nationalId: string): boolean {
  const digits = Array.from(nationalId, Number);
  const weightedSum = digits
    .slice(0, 12)
    .reduce((sum, digit, index) => sum + digit * (13 - index), 0);
  const expectedCheckDigit = (11 - (weightedSum % 11)) % 10;

  return digits[12] === expectedCheckDigit;
}

export function createThaiNationalIdSchema(
  environment: IdentityEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    allowTestNationalIds: process.env[TEST_NATIONAL_ID_ENVIRONMENT_VARIABLE],
  },
): z.ZodType<string> {
  const nationalIdChecks = z
    .string()
    .regex(/^\d{13}$/, "Thai National ID must contain exactly 13 digits")
    .refine(
      (nationalId) => /^[1-8]/.test(nationalId),
      "Thai National ID category digit is invalid",
    );

  const validatedNationalId = isTestNationalIdBypassEnabled(environment)
    ? nationalIdChecks
    : nationalIdChecks.refine(
        hasValidThaiNationalIdChecksum,
        "Thai National ID checksum is invalid",
      );

  return z.string().max(32).transform((value) => value.trim()).pipe(validatedNationalId);
}

export const thaiNationalIdSchema = createThaiNationalIdSchema();

export const identityReferenceSchema = z
  .object({
    namespace: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, "Identity namespace is invalid"),
    value: z.string().trim().min(1).max(256),
  })
  .strict();

export const createPersonInputSchema = z
  .object({
    identity: identityReferenceSchema,
    givenName: optionalPersonName,
    familyName: optionalPersonName,
  })
  .strict();

export type IdentityReference = z.infer<typeof identityReferenceSchema>;
export type CreatePersonInput = z.infer<typeof createPersonInputSchema>;
export type ThaiNationalId = z.infer<typeof thaiNationalIdSchema>;
