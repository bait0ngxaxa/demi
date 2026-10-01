import { z } from "zod";

/**
 * Hospital onboarding still requires a validated Thai National ID. The
 * shared login boundary also accepts the bounded identifier chosen by the
 * trusted first-admin bootstrap, which uses the same identity namespace.
 */
export const passwordLoginIdentifierSchema = z
  .string()
  .max(32)
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(32));

export const loginFamilyInvitationReturnToSchema = z
  .string()
  .regex(/^\/app\/family\/invitations#[A-Za-z0-9_-]{43}$/u);

export const loginInputSchema = z
  .object({
    nationalId: passwordLoginIdentifierSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export type LoginInput = z.infer<typeof loginInputSchema>;
