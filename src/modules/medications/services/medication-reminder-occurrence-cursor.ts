import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env/server";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";
import { MAX_CURSOR_JSON_BYTES, MAX_CURSOR_LENGTH, canonicalReminderUuid, isCanonicalReminderBase64url } from "../domain/medication-reminder-occurrence";
import { medicationReminderOccurrenceCursorSchema, type MedicationReminderOccurrenceCursorPayload } from "../schemas/medication-reminder-occurrence-schemas";

const PREFIX = "medcur_v1_";

function canonicalJson(value: MedicationReminderOccurrenceCursorPayload): Buffer {
  return Buffer.from(JSON.stringify({
    cursorVersion: 1, sourceVersion: 1, medicationId: value.medicationId,
    aggregateVersion: value.aggregateVersion, from: value.from, to: value.to,
    evaluationAsOf: value.evaluationAsOf, lastDueAt: value.lastDueAt, lastSourceKey: value.lastSourceKey,
  }), "utf8");
}

function tag(actor: ActorContext, bytes: Buffer): Buffer {
  try {
    return createHmac("sha256", getServerEnv().IDENTITY_HASH_SECRET)
      .update(`demi.personal-medication-reminder-cursor.v1\u0000${canonicalReminderUuid(actor.userId)}\u0000${canonicalReminderUuid(actor.personId)}\u0000`, "utf8")
      .update(bytes).digest();
  } catch { throw new InfrastructureError(); }
}

export function encodeMedicationReminderOccurrenceCursor(actor: ActorContext, input: MedicationReminderOccurrenceCursorPayload): string {
  const parsed = medicationReminderOccurrenceCursorSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const bytes = canonicalJson(parsed.data);
  if (bytes.length > MAX_CURSOR_JSON_BYTES) throw new ValidationError();
  const cursor = `${PREFIX}${bytes.toString("base64url")}.${tag(actor, bytes).toString("base64url")}`;
  if (cursor.length > MAX_CURSOR_LENGTH) throw new ValidationError();
  return cursor;
}

export function decodeMedicationReminderOccurrenceCursor(actor: ActorContext, cursor: string): MedicationReminderOccurrenceCursorPayload {
  if (cursor.length > MAX_CURSOR_LENGTH || !cursor.startsWith(PREFIX)) throw new ValidationError();
  const segments = cursor.slice(PREFIX.length).split(".");
  if (segments.length !== 2) throw new ValidationError();
  const [payload, signature] = segments;
  if (!isCanonicalReminderBase64url(payload) || !isCanonicalReminderBase64url(signature)) throw new ValidationError();
  const bytes = Buffer.from(payload, "base64url");
  const suppliedTag = Buffer.from(signature, "base64url");
  if (bytes.length > MAX_CURSOR_JSON_BYTES || suppliedTag.length !== 32) throw new ValidationError();
  const json = bytes.toString("utf8");
  if (!Buffer.from(json, "utf8").equals(bytes)) throw new ValidationError();
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new ValidationError(); }
  const parsed = medicationReminderOccurrenceCursorSchema.safeParse(raw);
  if (!parsed.success || !canonicalJson(parsed.data).equals(bytes)) throw new ValidationError();
  const expectedTag = tag(actor, bytes);
  try {
    if (expectedTag.length !== 32 || !timingSafeEqual(expectedTag, suppliedTag)) throw new ValidationError();
  } catch (error: unknown) {
    if (error instanceof ValidationError) throw error;
    throw new InfrastructureError();
  }
  return parsed.data;
}
