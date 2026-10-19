import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { LINE_WORKFLOW_GATEWAY_PATH, LINE_WORKFLOW_INTENT } from "../domain/line-navigation-intents";
import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import type { LineMiniAppConfiguration } from "./line-mini-app-configuration";

/*
 * Phase 17J.3B section 12.1 primitives. Nothing in Phase B1 issues this
 * context to a browser; B2 owns minting and the mandatory scoped guards.
 */

export const LINE_WORKFLOW_CONTEXT_COOKIE_NAME = "__Secure-DEMI_LINE_WORKFLOW";
export const LINE_WORKFLOW_CONTEXT_MAX_LIFETIME_SECONDS = 15 * 60;
const FORMAT_VERSION = "v1";
const PURPOSE = "DEMI_LINE_WORKFLOW_CONTEXT_V1";
const SESSION_PURPOSE = "DEMI_MINI_WORKFLOW_SESSION_V1";
const MAX_ENCODED_LENGTH = 3 * 1024;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_KEYS = 3;

const base64UrlKey = z.string().regex(/^[A-Za-z0-9_-]{43}$/u)
  .transform((value) => Buffer.from(value, "base64url"))
  .refine((value) => value.length === 32);
const kidSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/u);

const keyringSchema = z.object({
  currentKid: kidSchema,
  keys: z.array(z.object({ kid: kidSchema, encryptionKey: base64UrlKey, sessionKey: base64UrlKey }).strict())
    .min(1).max(MAX_KEYS),
}).strict().superRefine((ring, context) => {
  const material = ring.keys.flatMap((key) => [key.encryptionKey.toString("hex"), key.sessionKey.toString("hex")]);
  if (new Set(ring.keys.map((key) => key.kid)).size !== ring.keys.length ||
      new Set(material).size !== material.length ||
      !ring.keys.some((key) => key.kid === ring.currentKid)) {
    context.addIssue({ code: "custom", message: "Invalid workflow context keyring" });
  }
});

type WorkflowContextKey = { kid: string; encryptionKey: Buffer; sessionKey: Buffer };
export type LineWorkflowContextKeyring = { currentKid: string; keys: ReadonlyMap<string, WorkflowContextKey> };

/**
 * Server-owned keyring JSON. Rotation: add a new current key, keep the old key
 * decrypt-only for at most 900 seconds after its last issuance, then remove it.
 * Removed (retired) or unknown key IDs are always rejected.
 */
export function parseLineWorkflowContextKeyring(raw: string | undefined): LineWorkflowContextKeyring {
  try {
    const ring = keyringSchema.parse(JSON.parse(raw ?? ""));
    return { currentKid: ring.currentKid, keys: new Map(ring.keys.map((key) => [key.kid, key])) };
  } catch {
    throw new LineWorkflowFailure("MINI_CONFIGURATION_UNAVAILABLE");
  }
}

export function getLineWorkflowContextKeyring(): LineWorkflowContextKeyring {
  return parseLineWorkflowContextKeyring(process.env.DEMI_LINE_MINI_APP_CONTEXT_KEYRING);
}

const claimsSchema = z.object({
  intent: z.literal(LINE_WORKFLOW_INTENT),
  tuple: z.string().regex(/^[a-f0-9]{64}$/u),
  bindingId: z.string().uuid(),
  bindingVersion: z.number().int().positive().safe(),
  userId: z.string().uuid(),
  sessionHash: z.string().regex(/^[a-f0-9]{64}$/u),
  issuedAt: z.number().int().positive().safe(),
  expiresAt: z.number().int().positive().safe(),
  proofExpiresAt: z.number().int().positive().safe(),
}).strict();

export type LineWorkflowContextClaims = z.infer<typeof claimsSchema>;
export type OpenedLineWorkflowContext = LineWorkflowContextClaims & { kid: string };

export type LineWorkflowContextSubject = {
  bindingId: string;
  bindingVersion: number;
  userId: string;
  sessionId: string;
  proofExpiresAt: Date;
};

type TupleSource = Pick<LineMiniAppConfiguration, "origin" | "environment" | "channelId" | "liffId">;

function tupleDescriptor(tuple: TupleSource): string {
  return [PURPOSE, tuple.origin, tuple.environment, tuple.channelId, tuple.liffId].join("|");
}

function tupleDigest(tuple: TupleSource): string {
  return createHash("sha256").update(tupleDescriptor(tuple)).digest("hex");
}

function associatedData(tuple: TupleSource, kid: string): Buffer {
  return Buffer.from(`${FORMAT_VERSION}|${kid}|${tupleDescriptor(tuple)}`, "utf8");
}

function sessionHash(key: WorkflowContextKey, sessionId: string): string {
  return createHmac("sha256", key.sessionKey).update(`${SESSION_PURPOSE}:${sessionId}`).digest("hex");
}

function epochSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1000);
}

/** Absolute, non-sliding lifetime: min(issuedAt + 15 minutes, verified proof expiry). */
export function lineWorkflowContextExpiry(issuedAt: number, proofExpiresAt: number): number {
  return Math.min(issuedAt + LINE_WORKFLOW_CONTEXT_MAX_LIFETIME_SECONDS, proofExpiresAt);
}

export function sealLineWorkflowContext(
  subject: LineWorkflowContextSubject,
  options: { keyring: LineWorkflowContextKeyring; tuple: TupleSource; now: Date },
): { value: string; expiresAt: Date } {
  const key = options.keyring.keys.get(options.keyring.currentKid);
  if (!key) throw new LineWorkflowFailure("MINI_CONFIGURATION_UNAVAILABLE");
  const issuedAt = epochSeconds(options.now);
  const proofExpiresAt = epochSeconds(subject.proofExpiresAt);
  const expiresAt = lineWorkflowContextExpiry(issuedAt, proofExpiresAt);
  if (expiresAt <= issuedAt) throw new LineWorkflowFailure("LINE_IDENTITY_INVALID");
  const claims: LineWorkflowContextClaims = claimsSchema.parse({
    intent: LINE_WORKFLOW_INTENT,
    tuple: tupleDigest(options.tuple),
    bindingId: subject.bindingId,
    bindingVersion: subject.bindingVersion,
    userId: subject.userId,
    sessionHash: sessionHash(key, subject.sessionId),
    issuedAt,
    expiresAt,
    proofExpiresAt,
  });
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key.encryptionKey, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(associatedData(options.tuple, key.kid));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()]);
  const value = [FORMAT_VERSION, key.kid, nonce.toString("base64url"), ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url")].join(".");
  if (value.length > MAX_ENCODED_LENGTH) throw new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE");
  return { value, expiresAt: new Date(expiresAt * 1000) };
}

const envelopePattern = /^v1\.([A-Za-z0-9_-]{1,32})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{1,3000})\.([A-Za-z0-9_-]{22})$/u;

/** Authenticated decryption plus strict structural, tuple and absolute-expiry validation. */
export function openLineWorkflowContext(
  value: string,
  options: { keyring: LineWorkflowContextKeyring; tuple: TupleSource; now: Date },
): OpenedLineWorkflowContext {
  if (value.length > MAX_ENCODED_LENGTH) throw new LineWorkflowFailure("SCOPE_INVALID");
  const match = envelopePattern.exec(value);
  const key = match ? options.keyring.keys.get(match[1]) : undefined;
  if (!match || !key) throw new LineWorkflowFailure("SCOPE_INVALID");
  const nonce = Buffer.from(match[2], "base64url");
  const tag = Buffer.from(match[4], "base64url");
  if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) throw new LineWorkflowFailure("SCOPE_INVALID");
  let claims: LineWorkflowContextClaims;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.encryptionKey, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(associatedData(options.tuple, key.kid));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(Buffer.from(match[3], "base64url")), decipher.final()]);
    claims = claimsSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
  } catch {
    throw new LineWorkflowFailure("SCOPE_INVALID");
  }
  const now = epochSeconds(options.now);
  if (claims.tuple !== tupleDigest(options.tuple) || claims.issuedAt > now ||
      claims.expiresAt !== lineWorkflowContextExpiry(claims.issuedAt, claims.proofExpiresAt) ||
      claims.expiresAt <= claims.issuedAt) {
    throw new LineWorkflowFailure("SCOPE_INVALID");
  }
  if (now >= claims.expiresAt) throw new LineWorkflowFailure("SCOPE_EXPIRED");
  return { ...claims, kid: key.kid };
}

/** Exact session equality under the context's own key generation, constant time. */
export function lineWorkflowContextSessionMatches(
  context: Pick<OpenedLineWorkflowContext, "kid" | "sessionHash">,
  sessionId: string,
  keyring: LineWorkflowContextKeyring,
): boolean {
  const key = keyring.keys.get(context.kid);
  if (!key) return false;
  return timingSafeEqual(Buffer.from(context.sessionHash, "hex"), Buffer.from(sessionHash(key, sessionId), "hex"));
}

/** Selected contract: host-only (no Domain), never __Host- with this non-root Path. */
export function lineWorkflowContextCookieOptions(expiresAt: Date, now: Date): {
  httpOnly: true; secure: true; sameSite: "lax"; path: typeof LINE_WORKFLOW_GATEWAY_PATH; maxAge: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: LINE_WORKFLOW_GATEWAY_PATH,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
  };
}
