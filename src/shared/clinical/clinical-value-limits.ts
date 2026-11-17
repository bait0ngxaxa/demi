import { z } from "zod";

/**
 * N3: plausibility limits for clinical measurements. Every schema, form input and bulk path that
 * stores one of these measurements takes its limits from here; no module keeps its own numbers.
 *
 * The limits are deliberately wide: they reject only values that cannot be real (a typo such as a
 * weight of 650 kg), not values that are possible but unusual. They are engineering defaults that
 * await Product Owner confirmation. The database CHECK constraints stay as a structural backstop.
 */
export type ClinicalMeasurementKind =
  | "weight"
  | "height"
  | "waistCircumference"
  | "systolicBloodPressure"
  | "diastolicBloodPressure"
  | "bloodSugar"
  | "hba1c";

export type ClinicalValueLimit = {
  /** Unit the value is stored in. */
  unit: string;
  /** Thai label used in field-level errors. */
  labelTh: string;
  /** Thai unit abbreviation used in field-level errors. */
  unitTh: string;
  /** Inclusive hard minimum. */
  min: number;
  /** Inclusive hard maximum. */
  max: number;
};

export const CLINICAL_VALUE_LIMITS = {
  weight: { unit: "kg", labelTh: "น้ำหนัก", unitTh: "กก.", min: 1, max: 500 },
  height: { unit: "cm", labelTh: "ส่วนสูง", unitTh: "ซม.", min: 30, max: 250 },
  waistCircumference: { unit: "cm", labelTh: "รอบเอว", unitTh: "ซม.", min: 20, max: 300 },
  systolicBloodPressure: { unit: "mmHg", labelTh: "ความดันตัวบน", unitTh: "มม.ปรอท", min: 40, max: 300 },
  diastolicBloodPressure: { unit: "mmHg", labelTh: "ความดันตัวล่าง", unitTh: "มม.ปรอท", min: 20, max: 200 },
  bloodSugar: { unit: "mg/dL", labelTh: "น้ำตาลในเลือด", unitTh: "มก./ดล.", min: 10, max: 1_000 },
  hba1c: { unit: "%", labelTh: "HbA1c", unitTh: "%", min: 2, max: 20 },
} as const satisfies Record<ClinicalMeasurementKind, ClinicalValueLimit>;

export const BLOOD_PRESSURE_ORDER_MESSAGE = "ความดันตัวบนต้องมากกว่าความดันตัวล่าง";

const LATIN_OR_DIGIT_ENDING = /[A-Za-z0-9]$/u;

/** The Thai field-level error, for example `น้ำหนักต้องอยู่ระหว่าง 1–500 กก.`. */
export function clinicalValueRangeMessage(kind: ClinicalMeasurementKind): string {
  const limit: ClinicalValueLimit = CLINICAL_VALUE_LIMITS[kind];
  const subject = LATIN_OR_DIGIT_ENDING.test(limit.labelTh) ? `${limit.labelTh} ` : limit.labelTh;
  const unit = limit.unitTh === "%" ? "%" : ` ${limit.unitTh}`;

  return `${subject}ต้องอยู่ระหว่าง ${limit.min}–${limit.max}${unit}`;
}

export function isClinicalValueInRange(kind: ClinicalMeasurementKind, value: number): boolean {
  const limit: ClinicalValueLimit = CLINICAL_VALUE_LIMITS[kind];

  return Number.isFinite(value) && value >= limit.min && value <= limit.max;
}

/** A required measurement within the hard limits of `kind`; callers add `.nullable()`/`.optional()`. */
export function clinicalMeasurementSchema(kind: ClinicalMeasurementKind): z.ZodNumber {
  const limit: ClinicalValueLimit = CLINICAL_VALUE_LIMITS[kind];
  const message = clinicalValueRangeMessage(kind);

  return z.number().finite().min(limit.min, message).max(limit.max, message);
}

/** True unless both values are present and systolic is not greater than diastolic. */
export function isBloodPressureOrderValid(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): boolean {
  return systolic == null || diastolic == null || systolic > diastolic;
}

/** Adds the systolic/diastolic issue on the systolic field when both values are present. */
export function refineBloodPressureOrder(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
  context: z.RefinementCtx,
  systolicPath: string,
): void {
  if (!isBloodPressureOrderValid(systolic, diastolic)) {
    context.addIssue({ code: "custom", message: BLOOD_PRESSURE_ORDER_MESSAGE, path: [systolicPath] });
  }
}
