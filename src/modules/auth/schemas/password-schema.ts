import { z } from "zod";

import { isBlocklistedPassword } from "../domain/password-blocklist";
import { passwordLengthIssue } from "../domain/password-policy";

/**
 * Every set/change of a user-owned password (ADR-0030). Each issue's message is a stable PasswordPolicyIssueCode, read
 * back with passwordPolicyIssueFrom. Sign-in schemas never use this, so existing passwords keep working.
 */
export const userOwnedPasswordSchema = z.string().superRefine((value, context) => {
  const lengthIssue = passwordLengthIssue(value);
  if (lengthIssue) {
    context.addIssue({ code: "custom", message: lengthIssue });
    return;
  }
  if (isBlocklistedPassword(value)) context.addIssue({ code: "custom", message: "PASSWORD_BLOCKLISTED" });
});

export type UserOwnedPassword = z.infer<typeof userOwnedPasswordSchema>;
