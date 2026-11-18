import type { PatientImportFieldKey } from "./patient-import-contract";

export const PATIENT_IMPORT_TEMPLATE_VERSION = "patient-import-template-v4" as const;
export const PATIENT_IMPORT_TEMPLATE_SHEET_NAME = "รายชื่อผู้ป่วย" as const;
export const PATIENT_IMPORT_TEMPLATE_INFO_SHEET_NAME = "ข้อมูลโรงพยาบาล" as const;
export const PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME = "_demi_meta" as const;
export const PATIENT_IMPORT_TEMPLATE_METADATA_VERSION_KEY = "templateVersion" as const;
export const PATIENT_IMPORT_TEMPLATE_METADATA_HOSPITAL_CODE_KEY = "hospitalCode" as const;
export const PATIENT_IMPORT_TEMPLATE_HEADER_ROW = 1 as const;
export const PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADER_ROW = 2 as const;
export const PATIENT_IMPORT_TEMPLATE_DATA_START_ROW = 3 as const;
export const PATIENT_IMPORT_TEMPLATE_MAX_DATA_ROWS = 500 as const;
export const PATIENT_IMPORT_TEMPLATE_DATA_END_ROW =
  PATIENT_IMPORT_TEMPLATE_DATA_START_ROW + PATIENT_IMPORT_TEMPLATE_MAX_DATA_ROWS - 1;
export const PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE =
  "รูปแบบไฟล์ไม่ตรงกับไฟล์ตัวอย่าง Excel ของระบบ กรุณาดาวน์โหลดไฟล์ตัวอย่างล่าสุดแล้วกรอกข้อมูลใหม่";

export function createPatientImportTemplateHospitalMismatchMessage(hospital: {
  hospitalName: string;
}): string {
  return `ไฟล์นี้ไม่ได้จัดทำสำหรับ ${hospital.hospitalName} กรุณาดาวน์โหลดไฟล์ตัวอย่าง Excel ของโรงพยาบาลที่เลือกแล้วกรอกข้อมูลใหม่`;
}

export const PATIENT_IMPORT_FAILED_ROWS_DOWNLOAD_PATH =
  "/api/v1/hospital/patient-import/failed-rows" as const;

export function createPatientImportTemplateDownloadPath(hospitalId: string): string {
  return `/api/v1/hospital/patient-import/template?hospitalId=${encodeURIComponent(hospitalId)}`;
}

function safeHospitalFilenameSegment(hospitalName: string): string {
  const normalizedName = hospitalName
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}._ -]/gu, "_")
    .replace(/\s+/gu, " ")
    .replace(/_+/gu, "_");
  const characters = Array.from(normalizedName);
  const truncatedCharacters = characters.slice(0, 80);

  if (
    characters.length > truncatedCharacters.length &&
    /\p{M}/u.test(characters[truncatedCharacters.length] ?? "")
  ) {
    while (
      truncatedCharacters.length > 0 &&
      /\p{M}/u.test(truncatedCharacters[truncatedCharacters.length - 1] ?? "")
    ) {
      truncatedCharacters.pop();
    }

    truncatedCharacters.pop();
  }

  const safeName = truncatedCharacters.join("").replace(/^[ ._-]+|[ ._-]+$/gu, "");

  return safeName || "โรงพยาบาล";
}

export function createPatientImportTemplateFilename(hospitalName: string): string {
  return `DEMI_${safeHospitalFilenameSegment(hospitalName)}_patient_import_v4.xlsx`;
}

export const PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER = "เหตุผล" as const;
export const PATIENT_IMPORT_FAILED_ROWS_FILENAME_SUFFIX = "failed_rows" as const;

export function createPatientImportFailedRowsFilename(hospitalName: string): string {
  return `DEMI_${safeHospitalFilenameSegment(hospitalName)}_patient_import_v4_${PATIENT_IMPORT_FAILED_ROWS_FILENAME_SUFFIX}.xlsx`;
}

export const PATIENT_IMPORT_TEMPLATE_CLASSIFICATION_VALUES = ["กลุ่มเสี่ยง", "เบาหวาน"] as const;

/** The only accepted medical/family history answers; a blank (or "-") cell means ไม่ทราบ. */
export const PATIENT_IMPORT_TEMPLATE_HEALTH_HISTORY_ANSWERS = {
  "มี": "YES",
  "ไม่มี": "NO",
  "ไม่ทราบ": "UNKNOWN",
} as const;
export const PATIENT_IMPORT_TEMPLATE_HEALTH_HISTORY_ANSWER_VALUES = Object.keys(
  PATIENT_IMPORT_TEMPLATE_HEALTH_HISTORY_ANSWERS,
) as readonly (keyof typeof PATIENT_IMPORT_TEMPLATE_HEALTH_HISTORY_ANSWERS)[];

export type PatientImportTemplateColumnFormat = "text" | "date" | "integer" | "numeric";

type PatientImportTemplateColumnDefinition = {
  readonly field: PatientImportFieldKey;
  readonly header: string;
  readonly format: PatientImportTemplateColumnFormat;
  readonly width: number;
  /** Row-2 caption; a column without one has a merged two-row header. */
  readonly secondaryHeader?: string;
};

export type PatientImportTemplateColumn = PatientImportTemplateColumnDefinition & {
  /** Spreadsheet letter, derived from the column's position in the contract. */
  readonly column: string;
};

/** 1-based column number to its spreadsheet letter (1 → A, 27 → AA). */
export function patientImportTemplateColumnLetter(columnNumber: number): string {
  let remaining = columnNumber;
  let letter = "";

  while (remaining > 0) {
    const offset = (remaining - 1) % 26;
    letter = String.fromCharCode(65 + offset) + letter;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return letter;
}

const HEALTH_HISTORY_ANSWER_CAPTION = "มี / ไม่มี / ไม่ทราบ (เว้นว่าง = ไม่ทราบ)";

/**
 * The template, in column order. Column letters, parser bindings, merges and the failed-rows
 * reason column all derive from this order; no other module hard-codes a letter.
 */
const PATIENT_IMPORT_TEMPLATE_COLUMN_DEFINITIONS = [
  { field: "sourceSequenceNumber", header: "ที่", format: "integer", width: 8 },
  { field: "nationalId", header: "เลขบัตรประชาชน", format: "text", width: 20 },
  { field: "dateOfBirth", header: "วันเกิด", format: "date", width: 15 },
  { field: "givenName", header: "ชื่อ", format: "text", width: 18 },
  { field: "familyName", header: "นามสกุล", format: "text", width: 18 },
  { field: "hospitalNumber", header: "HN", format: "text", width: 16 },
  { field: "gender", header: "เพศ", format: "text", width: 10 },
  { field: "phoneNumber", header: "เบอร์โทร", format: "text", width: 16 },
  { field: "weight", header: "น้ำหนัก", format: "numeric", width: 12 },
  { field: "height", header: "ส่วนสูง", format: "numeric", width: 12 },
  { field: "waistCircumference", header: "รอบเอว(ซม.)", format: "numeric", width: 15 },
  {
    field: "diabetesClassification",
    header: "ประเภทเบาหวาน",
    format: "text",
    width: 30,
    secondaryHeader: "กลุ่มเสี่ยง หรือ เบาหวาน (ไม่ต้องมี Type)",
  },
  { field: "bloodSugarDtx", header: "ค่าน้ำตาลในเลือด", format: "numeric", width: 20 },
  { field: "hba1c", header: "ค่า HbA1c ล่าสุด (ถ้ามี)", format: "numeric", width: 22 },
  { field: "bloodPressureSystolic", header: "ความดันตัวบน (mmHg)", format: "numeric", width: 18 },
  { field: "bloodPressureDiastolic", header: "ความดันตัวล่าง (mmHg)", format: "numeric", width: 18 },
  { field: "cvdRiskScore", header: "CVD risk score (%)", format: "numeric", width: 18 },
  { field: "houseNumber", header: "บ้านเลขที่", format: "text", width: 14 },
  { field: "villageNumber", header: "หมู่ที่/ชุมชน", format: "text", width: 16 },
  { field: "villageName", header: "หมู่บ้าน", format: "text", width: 18 },
  { field: "soi", header: "ซอย", format: "text", width: 16 },
  { field: "road", header: "ถนน", format: "text", width: 18 },
  { field: "province", header: "จังหวัด", format: "text", width: 18 },
  { field: "district", header: "อำเภอ", format: "text", width: 18 },
  { field: "subdistrict", header: "ตำบล", format: "text", width: 18 },
  { field: "postalCode", header: "รหัสไปรษณีย์", format: "text", width: 16 },
  { field: "emergencyContactName", header: "ชื่อผู้ติดต่อ(ญาติ)", format: "text", width: 22 },
  { field: "emergencyContactPhone", header: "เบอร์โทร", format: "text", width: 16 },
  { field: "emergencyContactRelationship", header: "ความสัมพันธ์", format: "text", width: 18 },
  {
    field: "historyDiabetes",
    header: "โรคประจำตัว: เบาหวาน",
    format: "text",
    width: 20,
    secondaryHeader: HEALTH_HISTORY_ANSWER_CAPTION,
  },
  {
    field: "historyHypertension",
    header: "โรคประจำตัว: ความดันโลหิตสูง",
    format: "text",
    width: 22,
    secondaryHeader: HEALTH_HISTORY_ANSWER_CAPTION,
  },
  {
    field: "otherConditions",
    header: "โรคประจำตัวอื่น ๆ",
    format: "text",
    width: 30,
    secondaryHeader: "ระบุชื่อโรค (ถ้ามี)",
  },
  {
    field: "familyHypertension",
    header: "ญาติสายตรง: ความดันโลหิตสูง",
    format: "text",
    width: 22,
    secondaryHeader: HEALTH_HISTORY_ANSWER_CAPTION,
  },
  {
    field: "familyDiabetes",
    header: "ญาติสายตรง: เบาหวาน",
    format: "text",
    width: 20,
    secondaryHeader: HEALTH_HISTORY_ANSWER_CAPTION,
  },
  {
    field: "familyHeartDisease",
    header: "ญาติสายตรง: โรคหัวใจ",
    format: "text",
    width: 20,
    secondaryHeader: HEALTH_HISTORY_ANSWER_CAPTION,
  },
  {
    field: "familyStroke",
    header: "ญาติสายตรง: หลอดเลือดสมอง / อัมพาต",
    format: "text",
    width: 26,
    secondaryHeader: HEALTH_HISTORY_ANSWER_CAPTION,
  },
] as const satisfies readonly PatientImportTemplateColumnDefinition[];

export const PATIENT_IMPORT_TEMPLATE_COLUMNS: readonly PatientImportTemplateColumn[] =
  PATIENT_IMPORT_TEMPLATE_COLUMN_DEFINITIONS.map((definition, index) => ({
    ...definition,
    column: patientImportTemplateColumnLetter(index + 1),
  }));

export const PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT =
  PATIENT_IMPORT_TEMPLATE_COLUMNS.length;

/** Failed-rows exports append exactly one trailing column; the parser ignores it. */
export const PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN = patientImportTemplateColumnLetter(
  PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT + 1,
);
export const PATIENT_IMPORT_FAILED_ROWS_COLUMN_COUNT =
  PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT + 1;

/** Row-2 captions keyed by column letter, in column order. */
export const PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS: Readonly<Record<string, string>> =
  Object.fromEntries(
    PATIENT_IMPORT_TEMPLATE_COLUMNS.flatMap(({ column, secondaryHeader }) =>
      secondaryHeader === undefined ? [] : [[column, secondaryHeader] as const],
    ),
  );

/** Every column is a merged two-row header except those carrying a secondary caption. */
export const PATIENT_IMPORT_TEMPLATE_MERGES: readonly string[] = PATIENT_IMPORT_TEMPLATE_COLUMNS.filter(
  ({ secondaryHeader }) => secondaryHeader === undefined,
).map(({ column }) => `${column}1:${column}2`);

export const PATIENT_IMPORT_FAILED_ROWS_MERGE = `${PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN}1:${PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN}2`;
