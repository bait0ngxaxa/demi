import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { ValidationError } from "@/shared/errors/application-error";

import { patientActivationTokenSchema } from "../schemas/patient-activation-schemas";

export const PATIENT_ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

export type PatientActivationCredential = {
  plaintextToken: string;
  tokenHash: string;
};

export type PatientActivationCredentialGenerator = () => PatientActivationCredential;

export function hashPatientActivationToken(token: string): string {
  const parsed = patientActivationTokenSchema.safeParse(token);

  if (!parsed.success) {
    throw new ValidationError("Patient activation link is invalid");
  }

  return createHash("sha256").update(parsed.data, "utf8").digest("hex");
}

export function generatePatientActivationCredential(): PatientActivationCredential {
  const plaintextToken = randomBytes(32).toString("base64url");

  return {
    plaintextToken,
    tokenHash: hashPatientActivationToken(plaintextToken),
  };
}

export function getPatientActivationExpiry(now: Date): Date {
  return new Date(now.getTime() + PATIENT_ACTIVATION_TTL_MS);
}
