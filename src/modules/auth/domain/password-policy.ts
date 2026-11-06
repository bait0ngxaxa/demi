import { ValidationError } from "@/shared/errors/application-error";

/**
 * DEMI user-owned password policy (ADR-0030): 8–128 Unicode code points, no composition rules, blocklist screening and
 * a personal-information check on every set/change. Sign-in never applies this policy, so existing passwords keep
 * working. The value is never trimmed or normalised: the provider stores exactly what the person typed.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
/** Supabase Auth hashes with bcrypt and refuses passwords over 72 UTF-8 bytes (about 24 Thai characters). */
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_POLICY_ISSUE_CODES = [
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "PASSWORD_TOO_MANY_BYTES",
  "PASSWORD_BLOCKLISTED",
  "PASSWORD_PERSONAL_INFO",
] as const;

export type PasswordPolicyIssueCode = (typeof PASSWORD_POLICY_ISSUE_CODES)[number];

/** Length in Unicode code points (NIST SP 800-63B-4): a Thai combining mark counts as one character. */
export function passwordLength(value: string): number {
  return [...value].length;
}

export function passwordByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Length-only check, safe for client bundles (the blocklist is screened on the server). */
export function passwordLengthIssue(value: string): PasswordPolicyIssueCode | null {
  const length = passwordLength(value);
  if (length < PASSWORD_MIN_LENGTH) return "PASSWORD_TOO_SHORT";
  if (length > PASSWORD_MAX_LENGTH) return "PASSWORD_TOO_LONG";
  if (passwordByteLength(value) > PASSWORD_MAX_BYTES) return "PASSWORD_TOO_MANY_BYTES";
  return null;
}

export function isPasswordPolicyIssueCode(value: unknown): value is PasswordPolicyIssueCode {
  return typeof value === "string" && PASSWORD_POLICY_ISSUE_CODES.some((code) => code === value);
}

/** A password the policy refused; the reason is shown to the person (NIST requires telling them why). */
export class PasswordPolicyRejectedError extends ValidationError {
  readonly reason: PasswordPolicyIssueCode;

  constructor(reason: PasswordPolicyIssueCode) {
    super("The password does not meet the password policy");
    this.name = "PasswordPolicyRejectedError";
    this.reason = reason;
  }
}

type PolicyIssue = { readonly path: readonly PropertyKey[]; readonly message: string; readonly code?: string };

/** The first password-policy issue on one of `fields`, if schema parsing failed because of the policy. */
export function passwordPolicyIssueFrom(
  issues: readonly PolicyIssue[],
  fields: readonly string[],
): PasswordPolicyIssueCode | null {
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && fields.includes(field) && isPasswordPolicyIssueCode(issue.message)) {
      return issue.message;
    }
  }
  return null;
}

/** Throws the reasoned policy error when schema parsing failed because of a policy issue on `fields`. */
export function throwIfPasswordPolicyIssue(issues: readonly PolicyIssue[], fields: readonly string[]): void {
  const reason = passwordPolicyIssueFrom(issues, fields);
  if (reason) throw new PasswordPolicyRejectedError(reason);
}
