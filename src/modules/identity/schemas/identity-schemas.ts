import { z } from "zod";

const optionalPersonName = z.string().trim().min(1).max(120).optional();

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
