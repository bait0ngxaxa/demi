import { describe, expect, it } from "vitest";
import { mealCreateSchema, mealUpdateSchema } from "./personal-meal-schemas";
import { MEAL_CATEGORIES, fromMealDateCarrier, toMealDateCarrier, mealBangkokToday, isMealCivilDate } from "../domain/personal-meal";
import { parseMealForm } from "../transport/meal-form";
const fields = { submissionNonce: "11111111-1111-4111-8111-111111111111", category: "SNACK", occurredOn: "2024-02-29" };
describe("Meal validation and civil truth", () => {
  it("permits exactly four explicit categories and optional description", () => {
    expect(MEAL_CATEGORIES).toEqual(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]);
    for (const category of MEAL_CATEGORIES) expect(mealCreateSchema.parse({ ...fields, category }).description).toBeNull();
    for (const category of ["OTHER", "breakfast", "", " BREAKFAST"]) expect(mealCreateSchema.safeParse({ ...fields, category }).success).toBe(false);
  });
  it.each([undefined, null, "", " \n\t "])("normalizes empty %s to null", (description) => { expect(mealCreateSchema.parse({ ...fields, description }).description).toBeNull(); });
  it("preserves Unicode/interior text and rejects rather than truncates UTF-16/raw overflow", () => {
    const text = "อาหารไทย  🥗\n<script>ข้อความ</script> **literal**";
    expect(mealCreateSchema.parse({ ...fields, description: ` \n${text}\t ` }).description).toBe(text);
    expect(mealCreateSchema.parse({ ...fields, description: "🥗".repeat(500) }).description?.length).toBe(1000);
    for (const description of ["ก".repeat(1001), "🥗".repeat(501), " ".repeat(2001)]) expect(mealCreateSchema.safeParse({ ...fields, description }).success).toBe(false);
    expect(mealCreateSchema.parse({ ...fields, description: " ".repeat(1000) + "ก".repeat(1000) }).description).toHaveLength(1000);
  });
  it.each(["patientProfileId", "personId", "userId", "hospitalId", "calories", "photo", "creationRequestHash"])("rejects unapproved %s", (key) => {
    expect(mealCreateSchema.safeParse({ ...fields, [key]: "value" }).success).toBe(false);
  });
  it.each(["0001-01-01", "2024-02-29", "2000-02-29", "2026-10-03", "9999-12-31"])("valid DATE adapter roundtrip %s", (value) => {
    expect(isMealCivilDate(value)).toBe(true); expect(fromMealDateCarrier(toMealDateCarrier(value))).toBe(value);
  });
  it.each(["0000-01-01", "1900-02-29", "2025-02-29", "2024-02-30", "2026-13-01", "2026-01-00", "2569-1-1", "2026-10-03T00:00Z"])("rejects invalid calendar %s", (occurredOn) => {
    expect(mealCreateSchema.safeParse({ ...fields, occurredOn }).success).toBe(false);
    expect(mealUpdateSchema.safeParse({ entryId: fields.submissionNonce, expectedUpdatedAt: "2026-10-03T00:00:00.000Z", category: fields.category, occurredOn }).success).toBe(false);
  });
  it("Bangkok midnight uses explicit Gregorian calendar independently of process TZ", () => {
    expect(mealBangkokToday(new Date("2026-10-02T16:59:59.999Z"))).toBe("2026-10-02");
    expect(mealBangkokToday(new Date("2026-10-02T17:00:00.000Z"))).toBe("2026-10-03");
    for (const zone of ["UTC", "Asia/Bangkok", "America/Los_Angeles"]) {
      const original = process.env.TZ; process.env.TZ = zone;
      try { expect(fromMealDateCarrier(toMealDateCarrier("2024-02-29"))).toBe("2024-02-29"); }
      finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
    }
  });
  it("strict bounded form rejects duplicates/files/authority/oversize and ignores only framework fields", () => {
    const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.set(key, value);
    form.set("$ACTION_ID_example", "framework"); expect(parseMealForm(form, "create")).toEqual(fields);
    form.append("category", "LUNCH"); expect(() => parseMealForm(form, "create")).toThrow(); form.delete("category");
    form.set("description", new Blob(["text"]), "photo.txt"); expect(() => parseMealForm(form, "create")).toThrow(); form.delete("description");
    form.set("patientProfileId", fields.submissionNonce); expect(() => parseMealForm(form, "create")).toThrow(); form.delete("patientProfileId");
    form.set("description", "ก".repeat(16 * 1024)); expect(() => parseMealForm(form, "create")).toThrow();
  });
});
