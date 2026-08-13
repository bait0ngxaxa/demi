import { z } from "zod";

const optionalPersonName = z.string().trim().min(1).max(120).optional();

export const THAI_NATIONAL_IDENTITY_NAMESPACE = "thai-national-id";

function hasValidThaiNationalIdChecksum(nationalId: string): boolean {
  const digits = Array.from(nationalId, Number);
  const weightedSum = digits
    .slice(0, 12)
    .reduce((sum, digit, index) => sum + digit * (13 - index), 0);
  const expectedCheckDigit = (11 - (weightedSum % 11)) % 10;

  return digits[12] === expectedCheckDigit;
}

export const thaiNationalIdSchema = z
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
      )
      .refine(hasValidThaiNationalIdChecksum, "Thai National ID checksum is invalid"),
  );

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
