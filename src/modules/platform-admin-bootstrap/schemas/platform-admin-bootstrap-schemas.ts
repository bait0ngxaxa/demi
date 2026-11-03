import { z } from "zod";

import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
import { passwordLoginIdentifierSchema } from "@/modules/auth/schemas/login-schema";
import { legalAcceptanceInputSchema } from "@/modules/legal/schemas/legal-schemas";

const personNameSchema = z.string().trim().min(1).max(120);

export const platformAdminBootstrapInputSchema = z
  .object({
    nationalId: passwordLoginIdentifierSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    password: userOwnedPasswordSchema,
    /** LG-1 §3: the operator accepts the current Terms + Privacy explicitly on the CLI (`--accept-legal`). */
    acceptLegal: legalAcceptanceInputSchema,
  })
  .strict();

export type PlatformAdminBootstrapInput = z.infer<typeof platformAdminBootstrapInputSchema>;
