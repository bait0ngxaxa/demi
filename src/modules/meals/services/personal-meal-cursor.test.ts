import { describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { encodeMealCursor, decodeMealCursor } from "./personal-meal-cursor";
const actor: ActorContext = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: ["PATIENT"], hospitalMemberships: [], osmHospitalRelationships: [] };
const anchor = { version: 1 as const, patientProfileId: "33333333-3333-4333-8333-333333333333", id: "44444444-4444-4444-8444-444444444444", occurredOn: "2026-10-03", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" };
describe("Meal-specific authenticated cursor", () => {
  it("roundtrips canonical position only, without category/description", () => {
    const token = encodeMealCursor(actor, anchor); expect(token.length).toBeLessThan(2048);
    expect(decodeMealCursor(actor, anchor.patientProfileId, token)).toEqual(anchor);
    const payload = Buffer.from(token.slice("mealcur_v1_".length).split(".")[0], "base64url").toString("utf8");
    expect(payload).not.toMatch(/description|category|SNACK/u);
  });
  it("binds user/person/owner and rejects tampering, foreign domain, noncanonical/oversize", () => {
    const token = encodeMealCursor(actor, anchor);
    for (const altered of [{ ...actor, userId: anchor.id }, { ...actor, personId: anchor.id }]) expect(() => decodeMealCursor(altered, anchor.patientProfileId, token)).toThrow();
    expect(() => decodeMealCursor(actor, anchor.id, token)).toThrow();
    for (const altered of [token + "=", token.replace("mealcur", "medcur"), token.slice(0, -5), "x".repeat(2049), token.replace(".", "..")]) expect(() => decodeMealCursor(actor, anchor.patientProfileId, altered)).toThrow();
  });
});
