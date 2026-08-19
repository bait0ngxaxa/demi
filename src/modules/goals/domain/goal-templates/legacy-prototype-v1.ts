import type { GoalTemplate } from "./types";

const exerciseTarget = {
  defaultValue: 10,
  unit: "minutes",
  min: 5,
  max: 120,
  step: 5,
} as const;

export const legacyPrototypeV1GoalTemplate = {
  key: "demi-goals",
  version: "legacy-prototype-v1",
  label: "DEMI — แผนเป้าหมายและกิจกรรม",
  primaryGoals: [
    { code: "weight", label: "น้ำหนักลด" },
    { code: "glucose", label: "ควบคุมระดับน้ำตาล" },
    { code: "medication", label: "ลดการใช้ยา" },
    { code: "remission", label: "ภาวะเบาหวานสงบ" },
  ],
  activities: [
    { code: "stop_sweet", label: "ลดหวาน", category: "FOOD", targetRule: null },
    { code: "reduce_rice", label: "ลดข้าว/แป้ง", category: "FOOD", targetRule: null },
    { code: "protein_vegetable", label: "เพิ่มโปรตีนและผัก", category: "FOOD", targetRule: null },
    {
      code: "exercise_walk",
      label: "เดินออกกำลังกาย",
      category: "EXERCISE",
      targetRule: { ...exerciseTarget, defaultValue: 15 },
    },
    { code: "record_weight_sugar", label: "บันทึกน้ำหนักและน้ำตาล", category: "MEASUREMENT", targetRule: null },
    { code: "carb_control", label: "ควบคุมคาร์โบไฮเดรต", category: "FOOD", targetRule: null },
    { code: "protein_intake", label: "รับประทานโปรตีน", category: "FOOD", targetRule: null },
    {
      code: "water_intake",
      label: "ดื่มน้ำ",
      category: "FOOD",
      targetRule: { defaultValue: 1, unit: "liters", min: 0.1, max: 10, step: 0.1 },
    },
    { code: "stretching", label: "ยืดเหยียด", category: "EXERCISE", targetRule: exerciseTarget },
    { code: "cardio", label: "คาร์ดิโอ", category: "EXERCISE", targetRule: exerciseTarget },
    { code: "strengthening", label: "เสริมสร้างกล้ามเนื้อ", category: "EXERCISE", targetRule: exerciseTarget },
    {
      code: "hiit",
      label: "ออกกำลังกายแบบหนักสลับเบา (HIIT)",
      category: "EXERCISE",
      targetRule: exerciseTarget,
    },
    { code: "sleep", label: "นอนหลับ", category: "REST", targetRule: null },
  ],
  activitySuggestions: [
    { level: "L1", activityCodes: [], defaultTargetDays: 0 },
    {
      level: "L2",
      activityCodes: [
        "stop_sweet",
        "reduce_rice",
        "protein_vegetable",
        "exercise_walk",
        "record_weight_sugar",
      ],
      defaultTargetDays: 3,
    },
    {
      level: "L3",
      activityCodes: [
        "stop_sweet",
        "reduce_rice",
        "protein_vegetable",
        "exercise_walk",
        "record_weight_sugar",
      ],
      defaultTargetDays: 4,
    },
    {
      level: "L4",
      activityCodes: [
        "carb_control",
        "protein_intake",
        "water_intake",
        "stretching",
        "cardio",
        "strengthening",
        "hiit",
        "sleep",
      ],
      defaultTargetDays: 5,
    },
  ],
} as const satisfies GoalTemplate;
