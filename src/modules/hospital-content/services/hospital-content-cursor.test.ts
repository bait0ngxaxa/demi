import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decodeHospitalContentCursor,
  encodeHospitalContentCursor,
  hospitalContentCursorInternals,
} from "./hospital-content-cursor";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";
const actor: ActorContext = {
  userId: "33333333-3333-4333-8333-333333333333",
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const cursor = {
  version: 1 as const,
  hospitalId,
  updatedAt: "2026-10-05T12:34:56.789Z",
  id: "abcdefab-cdef-4abc-8abc-abcdefabcdef",
};
const context = `demi.hospital-content.publisher-cursor.v1\u0000${actor.userId}\u0000${actor.personId}\u0000${hospitalId}\u0000updatedAt-id-desc:25:all-statuses:no-filter\u0000`;

function signedToken(payload: Buffer, scope = context, secret = process.env.IDENTITY_HASH_SECRET ?? ""): string {
  const signature = createHmac("sha256", secret).update(scope, "utf8").update(payload).digest("base64url");
  return `${hospitalContentCursorInternals.PREFIX}${payload.toString("base64url")}.${signature}`;
}

describe("Hospital Content publisher cursor", () => {
  it("round trips canonical JSON and matches an independent HMAC-SHA256 fixture", () => {
    const token = encodeHospitalContentCursor(actor, cursor);
    const payload = Buffer.from(JSON.stringify(cursor), "utf8");
    const expectedTag = createHmac("sha256", process.env.IDENTITY_HASH_SECRET ?? "")
      .update(context, "utf8")
      .update(payload)
      .digest("base64url");
    expect(token).toBe(`${hospitalContentCursorInternals.PREFIX}${payload.toString("base64url")}.${expectedTag}`);
    expect(decodeHospitalContentCursor(actor, hospitalId, token)).toEqual(cursor);
    expect(token).not.toContain("article body");
  });

  it("binds the cursor to actor user, person and exact Hospital", () => {
    const token = encodeHospitalContentCursor(actor, cursor);
    expect(() => decodeHospitalContentCursor({ ...actor, userId: otherHospitalId }, hospitalId, token)).toThrow();
    expect(() => decodeHospitalContentCursor({ ...actor, personId: otherHospitalId }, hospitalId, token)).toThrow();
    expect(() => decodeHospitalContentCursor(actor, otherHospitalId, token)).toThrow();
  });

  it("rejects scope mismatch, tampering, malformed prefix, bad signature and noncanonical base64url", () => {
    const token = encodeHospitalContentCursor(actor, cursor);
    const replacement = token.endsWith("A") ? "B" : "A";
    expect(() => decodeHospitalContentCursor(actor, hospitalId, `${token.slice(0, -1)}${replacement}`)).toThrow();
    expect(() => decodeHospitalContentCursor(actor, hospitalId, token.replace("hcontentcur_v1_", "other_"))).toThrow();
    const [prefixAndPayload, signature] = token.split(".");
    expect(() => decodeHospitalContentCursor(actor, hospitalId, `${prefixAndPayload}=.${signature}`)).toThrow();
    expect(() => decodeHospitalContentCursor(actor, hospitalId, `${prefixAndPayload}.AAAA`)).toThrow();
  });

  it("rejects correctly signed reordered JSON, unknown keys and wrong fixed query scope", () => {
    const reordered = Buffer.from(JSON.stringify({ id: cursor.id, version: 1, hospitalId, updatedAt: cursor.updatedAt }), "utf8");
    expect(() => decodeHospitalContentCursor(actor, hospitalId, signedToken(reordered))).toThrow();

    const unknown = Buffer.from(JSON.stringify({ ...cursor, ignored: true }), "utf8");
    expect(() => decodeHospitalContentCursor(actor, hospitalId, signedToken(unknown))).toThrow();

    const payload = Buffer.from(JSON.stringify(cursor), "utf8");
    expect(() => decodeHospitalContentCursor(actor, hospitalId, signedToken(payload, `${context}wrong-page-size`))).toThrow();
  });

  it("enforces encoded and decoded size bounds and canonical cursor identifiers", () => {
    const token = encodeHospitalContentCursor(actor, cursor);
    expect(token.length).toBeLessThanOrEqual(hospitalContentCursorInternals.MAX_CURSOR_LENGTH);
    expect(() => decodeHospitalContentCursor(actor, hospitalId, `${hospitalContentCursorInternals.PREFIX}${"a".repeat(2_050)}`)).toThrow();
    expect(() => decodeHospitalContentCursor(actor, hospitalId, signedToken(Buffer.alloc(1_025, 0x20)))).toThrow();
    expect(() => encodeHospitalContentCursor(actor, { ...cursor, id: cursor.id.toUpperCase() })).toThrow();
    expect(() => encodeHospitalContentCursor(actor, { ...cursor, updatedAt: "2026-10-05T12:34:56Z" })).toThrow();
  });

  it("produces a different tag under a rotated signing secret", () => {
    const payload = hospitalContentCursorInternals.canonical(cursor);
    const currentTag = hospitalContentCursorInternals.signature(actor, hospitalId, payload);
    const rotatedTag = createHmac("sha256", `${process.env.IDENTITY_HASH_SECRET ?? ""}-rotated`)
      .update(context, "utf8")
      .update(payload)
      .digest();
    expect(currentTag.equals(rotatedTag)).toBe(false);
  });
});
