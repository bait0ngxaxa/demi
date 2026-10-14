import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";

const PREFIX = "supportreportcur_v1_";
const MAX_CURSOR_LENGTH = 2_048;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const cursorSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().regex(timestampPattern).refine((value) => Number.isFinite(new Date(value).getTime()) && new Date(value).toISOString() === value),
  id: z.string().regex(uuidPattern),
}).strict();

export type SupportReportCursor = z.infer<typeof cursorSchema>;

function canonical(cursor: SupportReportCursor): Buffer {
  return Buffer.from(JSON.stringify({ version: 1, createdAt: cursor.createdAt, id: cursor.id }), "utf8");
}

function signature(actor: ActorContext, hospitalId: string, payload: Buffer): Buffer {
  let key: string;
  try { key = getServerEnv().IDENTITY_HASH_SECRET; }
  catch { throw new InfrastructureError("Support report cursor could not be secured"); }
  return createHmac("sha256", key)
    .update(`demi.support-report.cursor.v1\u0000${actor.userId.toLowerCase()}\u0000${actor.personId.toLowerCase()}\u0000${hospitalId.toLowerCase()}\u0000createdAt-id-desc:25:all-hospital-reports\u0000`, "utf8")
    .update(payload)
    .digest();
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  return bytes.toString("base64url") === value ? bytes : null;
}

export function encodeSupportReportCursor(actor: ActorContext, hospitalId: string, cursor: SupportReportCursor): string {
  const parsed = cursorSchema.safeParse(cursor);
  if (!parsed.success || parsed.data.id !== parsed.data.id.toLowerCase()) throw new ValidationError("Support report cursor is invalid");
  const payload = canonical(parsed.data);
  const token = `${PREFIX}${payload.toString("base64url")}.${signature(actor, hospitalId, payload).toString("base64url")}`;
  if (token.length > MAX_CURSOR_LENGTH) throw new ValidationError("Support report cursor is invalid");
  return token;
}

export function decodeSupportReportCursor(actor: ActorContext, hospitalId: string, token: string): SupportReportCursor {
  if (token.length > MAX_CURSOR_LENGTH || !token.startsWith(PREFIX)) throw new ValidationError("Support report cursor is invalid");
  const parts = token.slice(PREFIX.length).split(".");
  if (parts.length !== 2) throw new ValidationError("Support report cursor is invalid");
  const payload = decodeBase64Url(parts[0] ?? "");
  const suppliedSignature = decodeBase64Url(parts[1] ?? "");
  if (!payload || !suppliedSignature || suppliedSignature.byteLength !== 32) throw new ValidationError("Support report cursor is invalid");
  if (!timingSafeEqual(signature(actor, hospitalId, payload), suppliedSignature)) throw new ValidationError("Support report cursor is invalid");
  let raw: unknown;
  try { raw = JSON.parse(payload.toString("utf8")); }
  catch { throw new ValidationError("Support report cursor is invalid"); }
  const parsed = cursorSchema.safeParse(raw);
  if (!parsed.success || parsed.data.id !== parsed.data.id.toLowerCase() || !canonical(parsed.data).equals(payload)) throw new ValidationError("Support report cursor is invalid");
  return parsed.data;
}
