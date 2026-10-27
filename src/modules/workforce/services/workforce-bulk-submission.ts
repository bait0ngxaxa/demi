import "server-only";

import { createHmac } from "node:crypto";
import { z } from "zod";

import { getServerEnv } from "@/lib/env/server";
import { ValidationError } from "@/shared/errors/application-error";

import { workforceContactPhoneSchema } from "../schemas/workforce-schemas";

import type { WorkforceBulkProvisionInput } from "../schemas/workforce-schemas";

export const WORKFORCE_BULK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const WORKFORCE_BULK_MAX_ATTEMPTS = 3;

export const workforceBulkReceiptSchema = z.discriminatedUnion("status", [
  z.object({ rowNumber: z.number().int().min(1).max(50), status: z.enum(["created", "existing"]),
    userId: z.uuid(), relationshipId: z.uuid(), activationRequired: z.boolean() }).strict(),
  z.object({ rowNumber: z.number().int().min(1).max(50), status: z.literal("invalid"),
    reason: z.enum(["INVALID_ROW", "CONFLICT", "ROLE_INCOMPATIBLE", "UNAVAILABLE"]) }).strict(),
]);

function normalize(value: unknown, depth = 0): unknown {
  if (depth > 3) throw new ValidationError("Bulk row nesting is invalid");
  if (typeof value === "string") {
    if (value.length > 1024) throw new ValidationError("Bulk field is too long");
    return value.trim();
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) {
    if (value.length > 50) throw new ValidationError("Bulk row is too large");
    return value.map((entry) => normalize(entry, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value).sort();
    if (keys.length > 10) throw new ValidationError("Bulk row has too many fields");
    return Object.fromEntries(keys.map((key) => {
      const field = (value as Record<string, unknown>)[key];
      if (key === "contactPhone") {
        const parsed = workforceContactPhoneSchema.safeParse(field);
        // Preserve invalid raw characters: replay must not bypass the phone guard via trimming.
        if (typeof field === "string" && field.length <= 1024) return [key, parsed.success ? parsed.data : field];
      }
      return [key, normalize(field, depth + 1)];
    }));
  }
  throw new ValidationError("Bulk data is invalid");
}

export function fingerprintWorkforceBulkSubmission(actorUserId: string, input: WorkforceBulkProvisionInput): string {
  return createHmac("sha256", getServerEnv().IDENTITY_HASH_SECRET)
    .update("demi:workforce-bulk:v1\u0000", "utf8")
    .update(JSON.stringify([actorUserId, input.targetHospitalId, input.kind,
      normalize(input.rows), input.rowNumbers ?? input.rows.map((_, index) => index + 1)]), "utf8")
    .digest("hex");
}

export function workforceBulkSubmissionExpiry(submissionId: string, now: Date): Date {
  const issuedAt = Number(submissionId.split(".")[0]);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now.getTime() + 60_000 ||
    issuedAt + WORKFORCE_BULK_RETENTION_MS <= now.getTime()) {
    throw new ValidationError("Bulk submission key is expired or invalid");
  }
  return new Date(issuedAt + WORKFORCE_BULK_RETENTION_MS);
}
