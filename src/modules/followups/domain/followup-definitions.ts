import type { FollowupActivityProgressStatus } from "@prisma/client";

export const FOLLOWUP_HISTORY_LIMIT = 50;

export const FOLLOWUP_PROGRESS_STATUS_VALUES = [
  "DONE",
  "PARTIAL",
  "NOT_DONE",
  "NOT_APPLICABLE",
] as const satisfies readonly FollowupActivityProgressStatus[];

export type FollowupProgressStatus = (typeof FOLLOWUP_PROGRESS_STATUS_VALUES)[number];

export const FOLLOWUP_PROGRESS_STATUS_LABELS: Record<FollowupProgressStatus, string> = {
  DONE: "ทำได้ตามแผน",
  PARTIAL: "ทำได้บางส่วน",
  NOT_DONE: "ยังไม่ได้ทำ",
  NOT_APPLICABLE: "ไม่เกี่ยวข้องในรอบนี้",
};

export const FOLLOWUP_MEASUREMENT_DEFINITIONS = [
  { key: "weight", label: "น้ำหนัก", unit: "kg" },
  { key: "waistCircumference", label: "รอบเอว", unit: "cm" },
  { key: "systolicBloodPressure", label: "ความดันตัวบน", unit: "mmHg" },
  { key: "diastolicBloodPressure", label: "ความดันตัวล่าง", unit: "mmHg" },
  { key: "bloodSugar", label: "น้ำตาลในเลือด / DTX", unit: "DTX / mg%" },
] as const;
