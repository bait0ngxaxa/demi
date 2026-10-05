import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { getServerEnv } from "@/lib/env/server";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";

const PREFIX = "hcontentcur_v1_";
const MAX_CURSOR_LENGTH = 2_048;
const MAX_PAYLOAD_BYTES = 1_024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const cursorSchema = z.object({
  version: z.literal(1),
  hospitalId: z.string().regex(uuidPattern),
  updatedAt: z.string().regex(timestampPattern).refine((value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  }),
  id: z.string().regex(uuidPattern),
}).strict();

export type HospitalContentCursor = z.infer<typeof cursorSchema>;

function canonical(cursor: HospitalContentCursor): Buffer {
  return Buffer.from(JSON.stringify({
    version: 1,
    hospitalId: cursor.hospitalId,
    updatedAt: cursor.updatedAt,
    id: cursor.id,
  }), "utf8");
}

function getCursorSecret(): string {
  try {
    return getServerEnv().IDENTITY_HASH_SECRET;
  } catch {
    throw new InfrastructureError("Hospital Content cursor could not be secured");
  }
}

function signature(actor: ActorContext, hospitalId: string, payload: Buffer): Buffer {
  return createHmac("sha256", getCursorSecret())
    .update(`demi.hospital-content.publisher-cursor.v1\u0000${actor.userId.toLowerCase()}\u0000${actor.personId.toLowerCase()}\u0000${hospitalId.toLowerCase()}\u0000updatedAt-id-desc:25:all-statuses:no-filter\u0000`, "utf8")
    .update(payload)
    .digest();
}

function decodeCanonicalBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  return bytes.toString("base64url") === value ? bytes : null;
}

export function encodeHospitalContentCursor(actor: ActorContext, cursor: HospitalContentCursor): string {
  const parsed = cursorSchema.safeParse(cursor);
  if (!parsed.success || parsed.data.hospitalId !== parsed.data.hospitalId.toLowerCase() || parsed.data.id !== parsed.data.id.toLowerCase()) {
    throw new ValidationError("Hospital Content cursor is invalid");
  }
  const payload = canonical(parsed.data);
  if (payload.byteLength > MAX_PAYLOAD_BYTES) throw new ValidationError("Hospital Content cursor is invalid");
  const token = `${PREFIX}${payload.toString("base64url")}.${signature(actor, parsed.data.hospitalId, payload).toString("base64url")}`;
  if (token.length > MAX_CURSOR_LENGTH) throw new ValidationError("Hospital Content cursor is invalid");
  return token;
}

export function decodeHospitalContentCursor(actor: ActorContext, hospitalId: string, token: string): HospitalContentCursor {
  if (token.length > MAX_CURSOR_LENGTH || !token.startsWith(PREFIX)) throw new ValidationError("Hospital Content cursor is invalid");
  const segments = token.slice(PREFIX.length).split(".");
  if (segments.length !== 2) throw new ValidationError("Hospital Content cursor is invalid");
  const payload = decodeCanonicalBase64Url(segments[0] ?? "");
  const suppliedSignature = decodeCanonicalBase64Url(segments[1] ?? "");
  if (!payload || payload.byteLength > MAX_PAYLOAD_BYTES || !suppliedSignature || suppliedSignature.byteLength !== 32) {
    throw new ValidationError("Hospital Content cursor is invalid");
  }
  const expectedSignature = signature(actor, hospitalId, payload);
  if (!timingSafeEqual(expectedSignature, suppliedSignature)) throw new ValidationError("Hospital Content cursor is invalid");

  let raw: unknown;
  try {
    raw = JSON.parse(payload.toString("utf8"));
  } catch {
    throw new ValidationError("Hospital Content cursor is invalid");
  }
  const parsed = cursorSchema.safeParse(raw);
  if (!parsed.success || !canonical(parsed.data).equals(payload) || parsed.data.hospitalId !== hospitalId.toLowerCase()) {
    throw new ValidationError("Hospital Content cursor is invalid");
  }
  return parsed.data;
}

export const hospitalContentCursorInternals = {
  PREFIX,
  MAX_CURSOR_LENGTH,
  MAX_PAYLOAD_BYTES,
  canonical,
  signature,
  decodeCanonicalBase64Url,
};
