import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import { decodePatientSelfMeasurementCursor, encodePatientSelfMeasurementCursor } from "./patient-self-measurement-cursor";

const actor: ActorContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: ["PATIENT"],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

const position = {
  version: 1 as const,
  scope: "OWN" as const,
  scopeId: "33333333-3333-4333-8333-333333333333",
  measurementId: "44444444-4444-4444-8444-444444444444",
  measuredAt: "2026-10-14T05:00:00.000Z",
};

describe("Patient self-measurement cursor", () => {
  it("roundtrips only a canonical, scoped history position", () => {
    const cursor = encodePatientSelfMeasurementCursor(actor, position);

    expect(decodePatientSelfMeasurementCursor(actor, "OWN", position.scopeId, cursor)).toEqual(position);
    expect(cursor.length).toBeLessThan(2048);
    const payload = Buffer.from(cursor.slice("selfmeasure_v1_".length).split(".")[0] ?? "", "base64url").toString("utf8");
    expect(payload).not.toMatch(/note|weight|bloodSugar/u);
  });

  it("binds the cursor to its user, person, and history scope", () => {
    const cursor = encodePatientSelfMeasurementCursor(actor, position);

    expect(() => decodePatientSelfMeasurementCursor({ ...actor, userId: position.measurementId }, "OWN", position.scopeId, cursor)).toThrow();
    expect(() => decodePatientSelfMeasurementCursor({ ...actor, personId: position.scopeId }, "OWN", position.scopeId, cursor)).toThrow();
    expect(() => decodePatientSelfMeasurementCursor(actor, "CARE_TEAM", position.scopeId, cursor)).toThrow();
    expect(() => decodePatientSelfMeasurementCursor(actor, "OWN", position.measurementId, cursor)).toThrow();
    expect(() => decodePatientSelfMeasurementCursor(actor, "OWN", position.scopeId, `${cursor.slice(0, -1)}x`)).toThrow();
  });
});
