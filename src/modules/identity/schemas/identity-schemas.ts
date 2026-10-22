import { z } from "zod";

const optionalPersonName = z.string().trim().min(1).max(120).optional();

export const THAI_NATIONAL_IDENTITY_NAMESPACE = "thai-national-id";
export const TEST_NATIONAL_ID_ENVIRONMENT_VARIABLE = "DEMI_ALLOW_TEST_NATIONAL_IDS";
export const DEPLOYMENT_STAGE_ENVIRONMENT_VARIABLE = "DEMI_DEPLOYMENT_STAGE";

export type IdentityEnvironment = {
  nodeEnv?: string;
  deploymentStage?: string;
  allowTestNationalIds?: string;
};

function readRuntimeIdentityEnvironment(): IdentityEnvironment {
  if (typeof window !== "undefined") {
    return {};
  }

  return {
    nodeEnv: process.env["NODE_ENV"],
    deploymentStage: process.env[DEPLOYMENT_STAGE_ENVIRONMENT_VARIABLE],
    allowTestNationalIds: process.env[TEST_NATIONAL_ID_ENVIRONMENT_VARIABLE],
  };
}

export function isTestNationalIdBypassEnabled(
  environment?: IdentityEnvironment,
): boolean {
  const configuration = environment ?? readRuntimeIdentityEnvironment();

  if (configuration.deploymentStage === "production") {
    return false;
  }

  if (configuration.allowTestNationalIds !== "true") {
    return false;
  }

  if (configuration.nodeEnv === "production") {
    return configuration.deploymentStage === "uat";
  }

  if (
    configuration.deploymentStage !== undefined &&
    configuration.deploymentStage !== "development"
  ) {
    return false;
  }

  return configuration.nodeEnv === "development" || configuration.nodeEnv === "test";
}

function hasValidThaiNationalIdChecksum(nationalId: string): boolean {
  const digits = Array.from(nationalId, Number);
  const weightedSum = digits
    .slice(0, 12)
    .reduce((sum, digit, index) => sum + digit * (13 - index), 0);
  const expectedCheckDigit = (11 - (weightedSum % 11)) % 10;

  return digits[12] === expectedCheckDigit;
}

export const thaiNationalIdFormatSchema = z
  .string()
  .max(32)
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .regex(/^\d{13}$/, "Thai National ID must contain exactly 13 digits")
      .refine(
        (nationalId) => /^[1-8]/.test(nationalId),
        "Thai National ID category digit is invalid",
      ),
  );

export function createThaiNationalIdSchema(
  environment?: IdentityEnvironment,
): z.ZodType<string> {
  return thaiNationalIdFormatSchema.refine(
    (nationalId) =>
      isTestNationalIdBypassEnabled(environment) ||
      hasValidThaiNationalIdChecksum(nationalId),
    "Thai National ID checksum is invalid",
  );
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
