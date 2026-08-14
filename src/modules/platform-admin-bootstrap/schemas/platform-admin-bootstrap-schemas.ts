import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { passwordLoginIdentifierSchema } from "@/modules/auth/schemas/login-schema";

const personNameSchema = z.string().trim().min(1).max(120);

export const platformAdminBootstrapInputSchema = z
  .object({
    nationalId: passwordLoginIdentifierSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    password: userOwnedPasswordSchema,
  })
  .strict();

export type PlatformAdminBootstrapInput = z.infer<typeof platformAdminBootstrapInputSchema>;
