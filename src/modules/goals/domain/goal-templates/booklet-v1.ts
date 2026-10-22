import { legacyPrototypeV1GoalTemplate } from "./legacy-prototype-v1";
import type { GoalTemplate } from "./types";

/** The single stored primary goal code of a booklet plan; its goals are the booklet fields (R2-E). */
export const BOOKLET_PRIMARY_GOAL_CODE = "healthy-plan" as const;

/**
 * R2-E: แผน "สุขภาพดี" ของฉัน from the customer patient booklet (Product Owner, 2026-10-22). The food and
 * exercise sections keep the structured activity items of the legacy template (same codes), so Follow-up
 * progress (D6) and the workbook columns work unchanged. Measurement and rest activities are not in the
 * booklet plan.
 */
export const bookletV1GoalTemplate = {
  key: "demi-goals",
  version: "booklet-v1",
  label: "แผน “สุขภาพดี” ของฉัน",
  booklet: true,
  primaryGoals: [{ code: BOOKLET_PRIMARY_GOAL_CODE, label: "แผน “สุขภาพดี” ของฉัน" }],
  activities: legacyPrototypeV1GoalTemplate.activities.filter(
    (activity) => activity.category === "FOOD" || activity.category === "EXERCISE",
  ),
  activitySuggestions: [],
} as const satisfies GoalTemplate;

/** Booklet texts (verbatim). */
export const BOOKLET_PLAN_TEXT = {
  goalsHeading: "เป้าหมาย “สุขภาพดี” ของฉัน คือ (เลือกอย่างน้อย 1 ข้อ)",
  weightLoss: ["ฉันจะลดน้ำหนัก", "กก. ใน 3 เดือน"],
  waist: ["ฉันจะลดรอบเอว ให้เหลือ", "ซม. ใน 3 เดือน"],
  bloodSugar: ["ฉันจะลดน้ำตาล ให้ไม่เกิน", "มก/ดล."],
  hba1c: ["ฉันจะลดน้ำตาลสะสม ให้เหลือ", "%"],
  custom: "ฉันจะ",
  planHeading: "แผน “สุขภาพดี” ของฉัน ใน 3 เดือนนี้ คือ:",
  food: "ฉันจะคุมอาหาร",
  exercise: "ฉันจะออกกำลังกาย / เพิ่มกิจกรรมทางกาย",
  sectionText: "โดย ฉันจะ",
  sectionStart: "เริ่มตั้งแต่",
  sectionNotSet: "ไม่ได้ตั้งเป้า",
  problemsAfterOneMonth: "หลังลองทำไปแล้ว 1 เดือน ฉันพบปัญหา",
  patientSignature: ["ลงชื่อ", "(ฉัน)"],
  witnessSignature: ["ลงชื่อ", "(พยาน)"],
} as const;
