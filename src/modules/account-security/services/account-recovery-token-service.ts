import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { accountRecoveryTokenSchema } from "../schemas/account-security-schemas";

export function createAccountRecoveryToken(): string {
  const token = randomBytes(32).toString("base64url");
  return accountRecoveryTokenSchema.parse(token);
}

export function hashAccountRecoveryToken(token: string): string {
  const parsed = accountRecoveryTokenSchema.parse(token);
  return createHash("sha256").update(parsed, "utf8").digest("hex");
}
