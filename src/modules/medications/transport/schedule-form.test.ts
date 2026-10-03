import { describe, expect, it, vi } from "vitest";
import { parseMedicationScheduleForm as parse } from "./schedule-form";
import { personalMedicationScheduleSchema as schema } from "../schemas/personal-medication-schemas";
import { MEDICATION_SCHEDULE_JSON_MAX_LENGTH, MEDICATION_SCHEDULE_MAX_TIMES, MEDICATION_SCHEDULE_FORM_MAX_BYTES } from "../domain/personal-medication-definitions";

function form(times = "[]"): FormData {
  const result = new FormData();
  result.set("medicationId", "11111111-1111-4111-8111-111111111111");
  result.set("expectedUpdatedAt", "2026-10-03T00:00:00.000Z"); result.set("times", times);
  return result;
}
describe("bounded schedule JSON transport", () => {
  it("parses required explicit empty collection and ignores only framework fields", () => {
    const data = form(); data.set("$ACTION_ID_x", "framework");
    expect(schema.parse(parse(data)).times).toEqual([]);
  });
  it("accepts full 1440 collection within raw bounds", () => {
    const times = Array.from({ length: MEDICATION_SCHEDULE_MAX_TIMES }, (_, i) => `${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`);
    expect(schema.parse(parse(form(JSON.stringify(times)))).times).toEqual(times);
  });
  it.each(["medicationId", "expectedUpdatedAt", "times"])("rejects duplicate or File %s", (key) => {
    const data = form(); data.append(key, "x"); expect(() => parse(data)).toThrow();
    const file = form(); file.set(key, new File([], "private")); expect(() => parse(file)).toThrow();
  });
  it.each(["owner", "timezone", "__proto__", "$OTHER"])("rejects unknown field %s", (key) => { const data = form(); data.set(key, "x"); expect(() => parse(data)).toThrow(); });
  it("bounds fields and UTF-8 aggregate before JSON.parse", () => {
    const spy = vi.spyOn(JSON, "parse");
    try {
      for (const [key, value] of [["times", " ".repeat(MEDICATION_SCHEDULE_JSON_MAX_LENGTH + 1)], ["medicationId", "x".repeat(37)], ["expectedUpdatedAt", "x".repeat(41)], ["times", '"' + "ก".repeat(6000) + '"']]) {
        const data = form(); data.set(key, value); expect(() => parse(data)).toThrow();
      }
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it("accepts exact JSON raw length boundary and rejects missing/malformed values", () => {
    expect(parse(form("[]" + " ".repeat(MEDICATION_SCHEDULE_JSON_MAX_LENGTH - 2))).times).toEqual([]);
    const missing = form(); missing.delete("times"); expect(() => parse(missing)).toThrow();
    expect(() => parse(form("["))).toThrow();
  });
  it("enforces the exact aggregate UTF-8 byte boundary independently of code-unit length", () => {
    const base = form('[""]');
    const size = [...base.entries()].reduce((sum, [key, value]) => sum + new TextEncoder().encode(key + value).byteLength, 0);
    const remaining = MEDICATION_SCHEDULE_FORM_MAX_BYTES - size;
    const payload = "ก".repeat(Math.floor(remaining / 3)) + "a".repeat(remaining % 3);
    expect(parse(form(JSON.stringify([payload]))).times).toEqual([payload]);
    expect(() => parse(form(JSON.stringify([payload + "a"])))).toThrow();
  });
  it.each(["null", "{}", '"08:00"', '[1]', '["08:00","08:00"]', '["08:00:00"]'])("strict schema rejects parsed %s", (json) => {
    expect(schema.safeParse(parse(form(json))).success).toBe(false);
  });
});
