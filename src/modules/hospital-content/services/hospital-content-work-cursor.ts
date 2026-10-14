import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";

const PREFIX = "hcontentworkcur_v1_";
const MAX_CURSOR_LENGTH = 2_048;
const MAX_PAYLOAD_BYTES = 1_024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const cursorSchema = z.object({
  version: z.literal(1),
  latestPublishedAt: z.string().regex(timestampPattern).refine((value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  }),
  id: z.string().regex(uuidPattern),
}).strict();

export type HospitalContentWorkCursor = z.infer<typeof cursorSchema>;

function canonical(cursor: HospitalContentWorkCursor): Buffer {
  return Buffer.from(JSON.stringify({ version: 1, latestPublishedAt: cursor.latestPublishedAt, id: cursor.id }), "utf8");
}

function secret(): string {
  try { return getServerEnv().IDENTITY_HASH_SECRET; }
  catch { throw new InfrastructureError("Hospital work content cursor could not be secured"); }
}

function signature(actor: ActorContext, payload: Buffer): Buffer {
  return createHmac("sha256", secret())
    .update(`demi.hospital-content.work-cursor.v1\u0000${actor.userId.toLowerCase()}\u0000${actor.personId.toLowerCase()}\u0000latestPublishedAt-id-desc:25:published-content-current-membership-or-osm-hospitals\u0000`, "utf8")
    .update(payload)
    .digest();
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  return bytes.toString("base64url") === value ? bytes : null;
}

export function encodeHospitalContentWorkCursor(actor: ActorContext, cursor: HospitalContentWorkCursor): string {
  const parsed = cursorSchema.safeParse(cursor);
  if (!parsed.success || parsed.data.id !== parsed.data.id.toLowerCase()) throw new ValidationError("Hospital work content cursor is invalid");
  const payload = canonical(parsed.data);
  if (payload.byteLength > MAX_PAYLOAD_BYTES) throw new ValidationError("Hospital work content cursor is invalid");
  const token = `${PREFIX}${payload.toString("base64url")}.${signature(actor, payload).toString("base64url")}`;
  if (token.length > MAX_CURSOR_LENGTH) throw new ValidationError("Hospital work content cursor is invalid");
  return token;
}

export function decodeHospitalContentWorkCursor(actor: ActorContext, token: string): HospitalContentWorkCursor {
  if (token.length > MAX_CURSOR_LENGTH || !token.startsWith(PREFIX)) throw new ValidationError("Hospital work content cursor is invalid");
  const parts = token.slice(PREFIX.length).split(".");
  if (parts.length !== 2) throw new ValidationError("Hospital work content cursor is invalid");
  const payload = decodeBase64Url(parts[0] ?? "");
  const suppliedSignature = decodeBase64Url(parts[1] ?? "");
  if (!payload || payload.byteLength > MAX_PAYLOAD_BYTES || !suppliedSignature || suppliedSignature.byteLength !== 32) throw new ValidationError("Hospital work content cursor is invalid");
  if (!timingSafeEqual(signature(actor, payload), suppliedSignature)) throw new ValidationError("Hospital work content cursor is invalid");
  let raw: unknown;
  try { raw = JSON.parse(payload.toString("utf8")); }
  catch { throw new ValidationError("Hospital work content cursor is invalid"); }
  const parsed = cursorSchema.safeParse(raw);
  if (!parsed.success || parsed.data.id !== parsed.data.id.toLowerCase() || !canonical(parsed.data).equals(payload)) throw new ValidationError("Hospital work content cursor is invalid");
  return parsed.data;
}
