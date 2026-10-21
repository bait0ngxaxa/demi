import { z } from "zod";

export const HEALTH_HISTORY_FIELDS = {
  diabetes: "เบาหวาน",
  hypertension: "ความดันโลหิตสูง",
  familyHypertension: "ญาติสายตรง: ความดันโลหิตสูง",
  familyDiabetes: "ญาติสายตรง: เบาหวาน",
  familyHeartDisease: "ญาติสายตรง: โรคหัวใจ",
  familyStroke: "ญาติสายตรง: หลอดเลือดสมอง / อัมพาต",
} as const;

export function currentBuddhistYear(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric" }).format(now)) + 543;
}

export function illnessDuration(diagnosisYear: number | null | undefined, now: Date = new Date()): number | null {
  const year = currentBuddhistYear(now);
  return diagnosisYear != null && Number.isInteger(diagnosisYear) && diagnosisYear >= 2400 && diagnosisYear <= year
    ? year - diagnosisYear : null;
}

export const healthHistoryAnswerSchema = z.enum(["YES", "NO", "UNKNOWN"]);
export type HealthHistoryAnswer = z.output<typeof healthHistoryAnswerSchema>;
const answer = healthHistoryAnswerSchema;
export const patientHealthHistorySchema = z.object({
  expectedVersion: z.coerce.number().int().min(0),
  diabetes: answer,
  hypertension: answer,
  otherConditions: z.string().trim().max(1000).nullable(),
  familyHypertension: answer,
  familyDiabetes: answer,
  familyHeartDisease: answer,
  familyStroke: answer,
  diagnosisYear: z.number().int().min(2400).refine((value) => value <= currentBuddhistYear()).nullable(),
}).strict();

export type PatientHealthHistoryInput = z.output<typeof patientHealthHistorySchema>;

/** Initial history from a roster import: no version (create-only) and no diagnosis year column. */
export const importedPatientHealthHistorySchema = patientHealthHistorySchema
  .omit({ expectedVersion: true, diagnosisYear: true })
  .extend({ otherConditions: z.string().trim().min(1).max(1000).nullable() });

export type ImportedPatientHealthHistory = z.output<typeof importedPatientHealthHistorySchema>;
