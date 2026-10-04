import { describe, expect, it } from "vitest";
import { exerciseCreateSchema, exerciseUpdateSchema, exerciseDurationTextSchema, exerciseDeleteSchema } from "./personal-exercise-schemas";
import { fromExerciseDateCarrier, toExerciseDateCarrier, exerciseBangkokToday, isExerciseCivilDate } from "../domain/personal-exercise";
import { parseExerciseForm } from "../transport/exercise-form";
const fields = { submissionNonce: "11111111-1111-4111-8111-111111111111", activityName: "เดิน  สวน 🏃", occurredOn: "2024-02-29" };
function form(values: Record<string, string>): FormData { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; }
describe("Exercise text, integer, civil date and transport", () => {
  it("requires free text, preserves Thai/Unicode/case/interior and rejects NUL", () => {
    expect(exerciseCreateSchema.parse({ ...fields, activityName: `  ${fields.activityName}  ` })).toMatchObject({ activityName: fields.activityName, durationMinutes: null, note: null });
    for (const activityName of [undefined, null, "", " ", "เดิน\u0000", "ก".repeat(121), " ".repeat(241), "🏃".repeat(61)]) expect(exerciseCreateSchema.safeParse({ ...fields, activityName }).success).toBe(false);
    for (const activityName of ["ก".repeat(120), " ".repeat(120) + "ก".repeat(120), "🏃".repeat(60)]) expect(exerciseCreateSchema.parse({ ...fields, activityName }).activityName).toHaveLength(120);
    expect(exerciseCreateSchema.parse({ ...fields, activityName: "AbC  <script>literal</script>" }).activityName).toBe("AbC  <script>literal</script>");
  });
  it.each([undefined, null, "", " \n\t "])("optional note %s becomes null", (note) => { expect(exerciseCreateSchema.parse({ ...fields, note }).note).toBeNull(); });
  it("bounds note before/after normalization without truncating or collapsing newlines", () => {
    const note = "ไทย 🏃  ข้อความ\n<script>literal</script>";
    expect(exerciseCreateSchema.parse({ ...fields, note: ` \n${note}\t ` }).note).toBe(note);
    for (const note of ["ก".repeat(1000), " ".repeat(1000) + "ก".repeat(1000), "🏃".repeat(500)]) expect(exerciseCreateSchema.parse({ ...fields, note }).note).toHaveLength(1000);
    for (const note of ["ก".repeat(1001), " ".repeat(2001), "🏃".repeat(501), "ไทย\u0000"]) expect(exerciseCreateSchema.safeParse({ ...fields, note }).success).toBe(false);
  });
  it.each(["", "  ", "1", "1000000", "00000000000000000001"])("strict duration transport accepts %s", (text) => {
    const result = parseExerciseForm(form({ ...fields, durationMinutes: text }), "create");
    expect(exerciseCreateSchema.parse(result).durationMinutes).toBe(text.trim() === "" ? null : Number(text));
  });
  it.each(["0", "-1", "+1", "1.0", "1.1", "1e2", "0x10", "NaN", "Infinity", "text", "1000001", "1abc", "１", "111111111111111111111", " ".repeat(21)])("rejects duration syntax/range %s", (text) => {
    expect(exerciseDurationTextSchema.safeParse(text).success).toBe(false);
    expect(() => parseExerciseForm(form({ ...fields, durationMinutes: text }), "create")).toThrow();
  });
  it.each([0, -1, 1000001, 1.5, NaN, Infinity, "1", true, []])("typed service validation rejects %s", (durationMinutes) => { expect(exerciseCreateSchema.safeParse({ ...fields, durationMinutes }).success).toBe(false); });
  it.each([undefined, null, 1, 1000000])("typed service accepts optional/boundary %s", (durationMinutes) => { expect(exerciseCreateSchema.parse({ ...fields, durationMinutes }).durationMinutes).toBe(durationMinutes ?? null); });
  it.each(["patientProfileId", "personId", "userId", "hospitalId", "goalId", "programId", "relationshipId", "role", "calories", "metadata", "photo"])("rejects unapproved %s", (key) => {
    expect(exerciseCreateSchema.safeParse({ ...fields, [key]: "value" }).success).toBe(false);
    expect(() => parseExerciseForm(form({ ...fields, [key]: "value" }), "create")).toThrow();
  });
  it.each(["0001-01-01", "2024-02-29", "2000-02-29", "2026-10-03", "9999-12-31"])("civil adapter roundtrips %s", (value) => {
    expect(isExerciseCivilDate(value)).toBe(true); expect(fromExerciseDateCarrier(toExerciseDateCarrier(value))).toBe(value);
  });
  it.each(["0000-01-01", "1900-02-29", "2025-02-29", "2024-02-30", "2026-13-01", "2026-01-00", "2569-1-1", "2026-10-03T00:00Z"])("create/edit reject invalid civil %s", (occurredOn) => {
    expect(exerciseCreateSchema.safeParse({ ...fields, occurredOn }).success).toBe(false);
    expect(exerciseUpdateSchema.safeParse({ entryId: fields.submissionNonce, expectedUpdatedAt: "2026-10-03T00:00:00.000Z", activityName: fields.activityName, occurredOn }).success).toBe(false);
  });
  it("Bangkok midnight and process timezone preserve civil truth", () => {
    expect(exerciseBangkokToday(new Date("2026-10-02T16:59:59.999Z"))).toBe("2026-10-02");
    expect(exerciseBangkokToday(new Date("2026-10-02T17:00:00.000Z"))).toBe("2026-10-03");
    const original = process.env.TZ;
    try { for (const zone of ["UTC", "Asia/Bangkok", "America/Los_Angeles"]) { process.env.TZ = zone; expect(fromExerciseDateCarrier(toExerciseDateCarrier("2024-02-29"))).toBe("2024-02-29"); } }
    finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
  });
  it("strict form rejects duplicate/File/field overflows, accepts framework metadata", () => {
    const input = form(fields); input.set("$ACTION_ID_example", "framework"); expect(parseExerciseForm(input, "create")).toEqual(fields);
    input.append("note", "one"); input.append("note", "two"); expect(() => parseExerciseForm(input, "create")).toThrow(); input.delete("note");
    input.set("note", new Blob(["sensitive"]), "file.txt"); expect(() => parseExerciseForm(input, "create")).toThrow();
    for (const [key, length] of Object.entries({ submissionNonce: 36, activityName: 240, occurredOn: 10, durationMinutes: 20, note: 2000 })) expect(() => parseExerciseForm(form({ ...fields, [key]: "x".repeat(length + 1) }), "create")).toThrow();
    expect(() => parseExerciseForm(form({ cursor: "x".repeat(2049) }), "list")).toThrow();
    for (const expectedUpdatedAt of ["bad", "2026-10-03T00:00:00Z", "x".repeat(41)]) expect(exerciseDeleteSchema.safeParse({ entryId: fields.submissionNonce, expectedUpdatedAt }).success).toBe(false);
    expect(exerciseDeleteSchema.safeParse({ entryId: "bad", expectedUpdatedAt: "2026-10-03T00:00:00.000Z" }).success).toBe(false);
  });
  it("tighter allowlisted field bounds keep even maximum UTF-8 input below 16 KiB", () => {
    const input = form({ ...fields, activityName: "ก".repeat(240), note: "ก".repeat(2000), durationMinutes: " ".repeat(20) });
    const bytes = [...input].reduce((total, [key, value]) => total + new TextEncoder().encode(key + value).length, 0);
    expect(bytes).toBeLessThan(16 * 1024); expect(parseExerciseForm(input, "create").note).toHaveLength(2000);
    const repeated = form(fields); for (let index = 0; index < 10; index += 1) repeated.append("note", "ก".repeat(2000)); expect(() => parseExerciseForm(repeated, "create")).toThrow();
  });
});
