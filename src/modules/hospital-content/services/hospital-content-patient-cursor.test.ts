import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ValidationError } from "@/shared/errors/application-error";
import { decodeHospitalContentPatientCursor as decode, encodeHospitalContentPatientCursor as encode, hospitalContentPatientCursorInternals as internals } from "./hospital-content-patient-cursor";

const actor: ActorContext = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
const profile = "33333333-3333-4333-8333-333333333333";
const position = { version: 1 as const, category: null, firstPublishedAt: "2026-10-05T12:34:56.789Z", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const context = `demi.hospital-content.patient-cursor.v1\u0000${actor.userId}\u0000${actor.personId}\u0000${profile}\u0000all\u0000firstPublishedAt-id-desc:25:all-current-own-ACTIVE-Hospitals\u0000`;
function signed(payload: Buffer, scope: string = context): string {
  const mac = createHmac("sha256", process.env.IDENTITY_HASH_SECRET ?? "").update(scope).update(payload).digest("base64url");
  return `${internals.PREFIX}${payload.toString("base64url")}.${mac}`;
}
describe("Patient Content position cursor", () => {
  it.each([null, "NCD", "FOOD", "EXERCISE", "OTHER"] as const)("round trips %s without an anchor lookup or private identity payload", (category) => {
    const cursor = { ...position, category };
    const token = encode(actor, profile, cursor);
    expect(decode(actor, profile, category, token)).toEqual(cursor);
    const payload = Buffer.from(token.slice(internals.PREFIX.length).split(".")[0], "base64url").toString("utf8");
    expect(payload).toBe(JSON.stringify(cursor));
    expect(payload).not.toContain(profile);
    expect(payload).not.toMatch(/hospital|relationship|body|title|source|personId|userId/iu);
    expect(token.length).toBeLessThanOrEqual(2048);
  });
  it("binds user, person, freshly resolved Profile and category", () => {
    const token = encode(actor, profile, position);
    for (const changed of [{ ...actor, userId: profile }, { ...actor, personId: profile }]) expect(() => decode(changed, profile, null, token)).toThrow(ValidationError);
    expect(() => decode(actor, actor.userId, null, token)).toThrow(ValidationError);
    expect(() => decode(actor, profile, "FOOD", token)).toThrow(ValidationError);
  });
  it.each([
    context.replace(":25:", ":50:"), context.replace("firstPublishedAt-id-desc", "latestPublishedAt-id-desc"),
    context.replace("patient-cursor", "publisher-cursor"), context.replace("all-current-own-ACTIVE-Hospitals", "global"),
  ])("rejects valid signatures from a wrong fixed scope", (scope) => {
    expect(() => decode(actor, profile, null, signed(Buffer.from(JSON.stringify(position)), scope))).toThrow(ValidationError);
  });
  it.each([
    { ...position, version: 2 }, { ...position, extra: "x" }, { id: position.id, version: 1, category: null, firstPublishedAt: position.firstPublishedAt },
    { ...position, id: "invalid" }, { ...position, id: position.id.toUpperCase() },
    { ...position, firstPublishedAt: "2026-10-05T12:34:56Z" },
    { ...position, firstPublishedAt: "2026-02-30T12:34:56.789Z" }, { ...position, category: "ALL" },
  ])("rejects signed invalid or noncanonical JSON: %j", (payload) => {
    expect(() => decode(actor, profile, null, signed(Buffer.from(JSON.stringify(payload))))).toThrow(ValidationError);
  });
  it("rejects tamper, malformed/noncanonical encoding, version/prefix, MAC and both bounds", () => {
    const token = encode(actor, profile, position);
    const [payload, mac] = token.split(".");
    for (const invalid of [token + "x", token.replace("v1_", "v2_"), `${payload}=.${mac}`, `${payload}.AAAA`, `${payload}.!`, `${token}.x`, "x".repeat(2049), signed(Buffer.alloc(1025, 32)), signed(Buffer.from("not JSON")), signed(Buffer.from(" " + JSON.stringify(position)))]) {
      expect(() => decode(actor, profile, null, invalid)).toThrow(ValidationError);
    }
    expect(() => encode(actor, profile, { ...position, id: position.id.toUpperCase() })).toThrow(ValidationError);
  });
});
