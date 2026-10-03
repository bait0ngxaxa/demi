import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerEnv } from "@/lib/env/server";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createReminderSourceKey } from "../domain/medication-reminder-occurrence";
import { encodeMedicationReminderOccurrenceCursor as encode, decodeMedicationReminderOccurrenceCursor as decode } from "./medication-reminder-occurrence-cursor";
import type { MedicationReminderOccurrenceCursorPayload } from "../schemas/medication-reminder-occurrence-schemas";

vi.mock("@/lib/env/server", () => ({ getServerEnv: vi.fn() }));
const secret = "test-only-reminder-secret-32-characters";
const actor: ActorContext = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: ["PATIENT"], hospitalMemberships: [], osmHospitalRelationships: [] };
const payload: MedicationReminderOccurrenceCursorPayload = { cursorVersion: 1, sourceVersion: 1, medicationId: "44444444-4444-4444-8444-444444444444", aggregateVersion: "2026-10-03T00:00:00.000Z", from: "2026-10-03T17:00:00.000Z", to: "2026-10-04T17:00:00.000Z", evaluationAsOf: "2026-10-03T16:00:00.000Z", lastDueAt: "2026-10-04T01:00:00.000Z", lastSourceKey: createReminderSourceKey("55555555-5555-4555-8555-555555555555", "2026-10-04") };
// Test-only signer for deliberately invalid canonical encodings, outside production dependencies.
function signed(bytes: Buffer): string {
  const tag = createHmac("sha256", secret).update(`demi.personal-medication-reminder-cursor.v1\u0000${actor.userId}\u0000${actor.personId}\u0000`, "utf8").update(bytes).digest("base64url");
  return `medcur_v1_${bytes.toString("base64url")}.${tag}`;
}
function rejected(cursor: string, boundActor = actor): void {
  expect(() => decode(boundActor, cursor)).toThrowError(expect.objectContaining({ code: "VALIDATION", message: "The submitted data is invalid" }));
}
describe("canonical actor-bound reminder cursor", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(getServerEnv).mockReturnValue({ IDENTITY_HASH_SECRET: secret } as ReturnType<typeof getServerEnv>); });
  it("roundtrips exactly nine ordered fields, with independent HMAC fixture", () => {
    const encoded = encode(actor, payload);
    expect(encoded).toBe(signed(Buffer.from(JSON.stringify(payload), "utf8")));
    expect(encoded.startsWith("medcur_v1_")).toBe(true);
    expect(encoded.length).toBeLessThanOrEqual(1024);
    expect(decode(actor, encoded)).toEqual(payload);
    expect(Object.keys(JSON.parse(Buffer.from(encoded.slice(10).split(".")[0], "base64url").toString("utf8")))).toEqual(Object.keys(payload));
    expect(encode({ ...actor, userId: actor.userId.toUpperCase(), personId: actor.personId.toUpperCase() }, payload)).toBe(encoded);
  });
  it.each(Object.keys(payload))("rejects unsigned modification of %s", (field) => {
    const value = field === "cursorVersion" || field === "sourceVersion" ? 2 : field === "lastSourceKey" ? createReminderSourceKey(actor.userId, "2026-10-04") : field === "medicationId" ? actor.userId : "2026-10-03T15:00:00.000Z";
    const encoded = encode(actor, payload);
    const changed = Buffer.from(JSON.stringify({ ...payload, [field]: value }), "utf8").toString("base64url");
    rejected(`medcur_v1_${changed}.${encoded.split(".")[1]}`);
  });
  it("cannot backdate asOf; wrong actor or rotated secret cannot authenticate", () => {
    const encoded = encode(actor, payload);
    rejected(encoded, { ...actor, userId: payload.medicationId });
    rejected(encoded, { ...actor, personId: payload.medicationId });
    const key = createReminderSourceKey(actor.userId, "2026-10-04");
    vi.mocked(getServerEnv).mockReturnValue({ IDENTITY_HASH_SECRET: secret + "rotated" } as ReturnType<typeof getServerEnv>);
    rejected(encoded);
    expect(createReminderSourceKey(actor.userId, "2026-10-04")).toBe(key);
  });
  it("rejects alphabet/padding/segment/prefix/size errors before env access", () => {
    const encoded = encode(actor, payload);
    vi.mocked(getServerEnv).mockClear();
    for (const value of ["", encoded.replace("v1", "v2"), encoded + ".x", encoded + "=", encoded.replace(".", "=."), encoded.replace(".", "+."), encoded.replace(".", "/."), "x".repeat(1025), "medcur_v1_A.A", "medcur_v1_" + Buffer.alloc(513).toString("base64url") + "." + "A".repeat(43)]) rejected(value);
    expect(getServerEnv).not.toHaveBeenCalled();
  });
  it("rejects lossless UTF-8 failures and noncanonical trailing bits", () => {
    rejected(signed(Buffer.from([0xc3, 0x28])));
    rejected("medcur_v1_AB." + "A".repeat(43));
    const encoded = signed(Buffer.from(JSON.stringify(payload)));
    const tag = encoded.split(".")[1];
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const index = alphabet.indexOf(tag.at(-1) ?? "");
    rejected(encoded.slice(0, -1) + alphabet[index + 1]);
  });
  it("rejects signed noncanonical JSON, duplicate/unknown keys and unsupported versions", () => {
    const json = JSON.stringify(payload);
    for (const value of [" " + json, JSON.stringify(payload, null, 1), JSON.stringify(Object.fromEntries(Object.entries(payload).reverse())), json.replace('{"cursorVersion":1', '{"cursorVersion":1,"cursorVersion":1'), json.replace('"medicationId"', '"medication\\u0049d"'), JSON.stringify({ ...payload, extra: true }), JSON.stringify({ ...payload, cursorVersion: 2 }), JSON.stringify({ ...payload, sourceVersion: 2 }), JSON.stringify({ ...payload, lastDueAt: payload.to }), JSON.stringify({ ...payload, from: "2026-10-03T17:00:00Z" }), JSON.stringify({ ...payload, lastSourceKey: "invalid" }), JSON.stringify({ ...payload, medicationId: payload.medicationId.toUpperCase().replace("4", "A") })]) rejected(signed(Buffer.from(value, "utf8")));
  });
  it("rejects a canonical modified tag and sanitizes env/crypto infrastructure failure", () => {
    const encoded = encode(actor, payload);
    rejected(encoded.slice(0, encoded.indexOf(".") + 1) + Buffer.alloc(32).toString("base64url"));
    vi.mocked(getServerEnv).mockImplementation(() => { throw new Error("secret configuration"); });
    expect(() => decode(actor, encoded)).toThrowError(expect.objectContaining({ code: "INFRASTRUCTURE", message: "A dependent service is unavailable" }));
    expect(() => encode(actor, payload)).toThrowError(expect.objectContaining({ code: "INFRASTRUCTURE" }));
  });
});
