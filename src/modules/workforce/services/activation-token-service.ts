import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { WorkforceActivationMode } from "@prisma/client";

import { ValidationError } from "@/shared/errors/application-error";

import {
  workforceActivationModeSchema,
  workforceActivationTokenSchema,
  type WorkforceActivationMode as WorkforceActivationModeValue,
} from "../schemas/workforce-schemas";

export const WORKFORCE_REMOTE_ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
export const WORKFORCE_ASSISTED_ACTIVATION_TTL_MS = 15 * 60 * 1000;

export type ActivationCredential = {
  plaintextToken: string;
  tokenHash: string;
};

export type ActivationCredentialGenerator = () => ActivationCredential;

export function hashWorkforceActivationToken(token: string): string {
  const parsed = workforceActivationTokenSchema.safeParse(token);

  if (!parsed.success) {
    throw new ValidationError("Activation link is invalid");
  }

  return createHash("sha256").update(parsed.data, "utf8").digest("hex");
}

export function generateWorkforceActivationCredential(): ActivationCredential {
  const plaintextToken = randomBytes(32).toString("base64url");

  return {
    plaintextToken,
    tokenHash: hashWorkforceActivationToken(plaintextToken),
  };
}

export function toPrismaActivationMode(
  mode: WorkforceActivationModeValue,
): WorkforceActivationMode {
  const parsed = workforceActivationModeSchema.safeParse(mode);

  if (!parsed.success) {
    throw new ValidationError("Activation mode is invalid");
  }

  return parsed.data === "ASSISTED"
    ? WorkforceActivationMode.ASSISTED
    : WorkforceActivationMode.REMOTE;
}

export function getWorkforceActivationExpiry(
  now: Date,
  mode: WorkforceActivationModeValue,
): Date {
  const ttl =
    mode === "ASSISTED"
      ? WORKFORCE_ASSISTED_ACTIVATION_TTL_MS
      : WORKFORCE_REMOTE_ACTIVATION_TTL_MS;

  return new Date(now.getTime() + ttl);
}
