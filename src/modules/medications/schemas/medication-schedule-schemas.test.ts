import { describe, expect, it } from "vitest";
import { personalMedicationScheduleSchema as schema, personalMedicationCreateSchema } from "./personal-medication-schemas";
import { MEDICATION_SCHEDULE_MAX_TIMES } from "../domain/personal-medication-definitions";

const version = { medicationId: "11111111-1111-4111-8111-111111111111", expectedUpdatedAt: "2026-10-03T00:00:00.000Z" };
const allMinuteTimes = Array.from({ length: MEDICATION_SCHEDULE_MAX_TIMES }, (_, i) => `${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`);
describe("strict daily schedule schema", () => {
  it("accepts endpoints, unsorted input and canonicalizes without mutating caller", () => {
    const times = ["23:59", "08:00", "00:00"];
    expect(schema.parse({ ...version, times }).times).toEqual(["00:00", "08:00", "23:59"]);
    expect(times).toEqual(["23:59", "08:00", "00:00"]);
    expect(schema.parse({ ...version, times: [] }).times).toEqual([]);
  });
  it("accepts the complete representable domain and rejects excess/duplicates", () => {
    expect(schema.parse({ ...version, times: allMinuteTimes }).times).toHaveLength(MEDICATION_SCHEDULE_MAX_TIMES);
    for (const times of [["08:00", "08:00"], [...allMinuteTimes, "00:00"]]) expect(schema.safeParse({ ...version, times }).success).toBe(false);
  });
  it.each([undefined, null, "[]", {}, [null], [8], [new File([], "time")], ["8:00"], ["24:00"], ["12:60"], ["08:00:00"], ["08:00:00.000"], ["08:00Z"], ["08:00+07:00"], ["08:00 "], ["\n08:00"], ["๐๘:๐๐"], ["2026-10-03T08:00:00Z"]])("rejects invalid collection %j", (times) => {
    expect(schema.safeParse({ ...version, times }).success).toBe(false);
  });
  it.each(["owner", "patientProfileId", "id", "timezone", "frequency", "status", "createdAt", "dose"])("rejects extra %s", (key) => {
    expect(schema.safeParse({ ...version, times: [], [key]: "x" }).success).toBe(false);
  });
  it("retains current version semantics and unrelated Thai text", () => {
    expect(schema.safeParse({ ...version, expectedUpdatedAt: "yesterday", times: [] }).success).toBe(false);
    expect(schema.safeParse({ ...version, medicationId: "bad", times: [] }).success).toBe(false);
    expect(personalMedicationCreateSchema.parse({ medicationName: "ยาไทย", instructionText: "บันทึกเอง" })).toEqual({ medicationName: "ยาไทย", instructionText: "บันทึกเอง" });
  });
});
