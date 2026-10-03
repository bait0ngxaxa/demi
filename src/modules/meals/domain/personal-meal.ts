export const MEAL_CATEGORIES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
export type MealCategory = (typeof MEAL_CATEGORIES)[number];
export const MEAL_CATEGORY_LABELS: Record<MealCategory, string> = {
  BREAKFAST: "มื้อเช้า", LUNCH: "มื้อกลางวัน", DINNER: "มื้อเย็น", SNACK: "ของว่าง",
};
export const MEAL_PAGE_SIZE = 50;
export const MEAL_FORM_MAX_BYTES = 16 * 1024;
export const MEAL_CURSOR_MAX_LENGTH = 2048;
export const MEAL_CURSOR_MAX_BYTES = 1024;
export type PersonalMealDto = {
  id: string; category: MealCategory; occurredOn: string; description: string | null;
  createdAt: string; updatedAt: string;
};
export type PersonalMealPage = { items: PersonalMealDto[]; nextCursor: string | null };

// A Date here is strictly a Prisma DATE carrier, never a consumption instant.
export function isMealCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith("0000")) return false;
  const carrier = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(carrier.getTime()) && carrier.toISOString().slice(0, 10) === value;
}
export function toMealDateCarrier(value: string): Date {
  if (!isMealCivilDate(value)) throw new RangeError("Invalid civil date");
  return new Date(`${value}T00:00:00.000Z`);
}
export function fromMealDateCarrier(value: Date): string {
  const result = value.toISOString().slice(0, 10);
  if (!isMealCivilDate(result)) throw new RangeError("Invalid civil date carrier");
  return result;
}
export function mealBangkokToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok", calendar: "gregory", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (kind: string): string => parts.find(({ type }) => type === kind)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
