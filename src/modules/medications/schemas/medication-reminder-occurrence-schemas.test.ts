import { describe, expect, it } from "vitest";
import { medicationReminderOccurrenceQuerySchema as query, medicationReminderOccurrenceSourceSchema as source, medicationReminderOccurrenceCursorSchema as cursor } from "./medication-reminder-occurrence-schemas";
import { createReminderSourceKey } from "../domain/medication-reminder-occurrence";
const medicationId = "44444444-4444-4444-8444-444444444444";
const input = { medicationId, from: "2026-10-03T17:00:00.000Z", to: "2026-10-04T17:00:00.000Z" };
const known = { sourceKey: createReminderSourceKey(medicationId, "2026-10-04"), sourceVersion: 1, kind: "PERSONAL_MEDICATION_DAILY", personalMedicationId: medicationId, localDate: "2026-10-04", localTime: "08:00", dueAt: "2026-10-04T01:00:00.000Z", aggregateVersion: input.from };
describe("strict bounded reminder input", () => {
  it("accepts canonical query and normalizes incumbent UUID only", () => {
    expect(query.parse({ ...input, medicationId: medicationId.toUpperCase() })).toEqual(input);
    expect(source.safeParse(known).success).toBe(true);
  });
  it.each(["userId", "personId", "patientProfileId", "ownerId", "evaluationAsOf", "timezone", "pageSize", "limit"])("rejects extra authority/control field %s", (field) => {
    expect(query.safeParse({ ...input, [field]: "x" }).success).toBe(false);
    expect(source.safeParse({ ...known, [field]: "x" }).success).toBe(false);
  });
  it.each([null, "", "x".repeat(1025), "ไทย"])("rejects invalid cursor %s", (value) => expect(query.safeParse({ ...input, cursor: value }).success).toBe(false));
  it.each([new Date(input.from), 1791046800000, "2026-10-04T08:00:00.000+07:00", "2026-02-30T00:00:00.000Z", "1970-01-01T00:00:00.000z"])("rejects timestamp %s without coercion", (from) => expect(query.safeParse({ ...input, from }).success).toBe(false));
  it("rejects invalid bounds and source fields", () => {
    for (const value of [{ ...input, to: input.from }, { ...input, from: input.to }, { ...input, to: "2026-10-10T17:00:00.001Z" }, { ...input, medicationId: "x".repeat(37) }]) expect(query.safeParse(value).success).toBe(false);
    for (const value of [{ ...known, sourceVersion: 2 }, { ...known, kind: "other" }, { ...known, localDate: "2026-02-29" }, { ...known, localTime: "24:00" }, { ...known, sourceKey: "invalid" }]) expect(source.safeParse(value).success).toBe(false);
  });
  it("requires exact cursor predicates and shape", () => {
    const payload = { cursorVersion: 1, sourceVersion: 1, ...input, aggregateVersion: known.aggregateVersion, evaluationAsOf: input.from, lastDueAt: known.dueAt, lastSourceKey: known.sourceKey };
    expect(cursor.safeParse(payload).success).toBe(true);
    for (const change of [{ lastDueAt: input.from }, { lastDueAt: input.to }, { evaluationAsOf: known.dueAt }, { cursorVersion: 2 }, { extra: true }]) expect(cursor.safeParse({ ...payload, ...change }).success).toBe(false);
  });
});
