import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { ValidationError } from "@/shared/errors/application-error";

import { caregiverInvitationTokenSchema } from "../schemas/caregiver-relationship-schemas";

export type CaregiverInvitationCredential = {
  plaintextToken: string;
  tokenHash: string;
};

export function hashCaregiverInvitationToken(token: string): string {
  const parsed = caregiverInvitationTokenSchema.safeParse(token);

  if (!parsed.success) {
    throw new ValidationError("Caregiver invitation link is invalid");
  }

  return createHash("sha256").update(parsed.data, "utf8").digest("hex");
}

export function generateCaregiverInvitationCredential(): CaregiverInvitationCredential {
  const plaintextToken = randomBytes(32).toString("base64url");

  return {
    plaintextToken,
    tokenHash: hashCaregiverInvitationToken(plaintextToken),
  };
}
