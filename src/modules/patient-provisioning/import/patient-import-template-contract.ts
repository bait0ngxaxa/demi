import type { PatientImportFieldKey } from "./patient-import-contract";

export const PATIENT_IMPORT_TEMPLATE_VERSION = "patient-import-template-v2" as const;
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
  "รูปแบบไฟล์ไม่ตรงกับ Template รายชื่อผู้ป่วยของระบบ กรุณาดาวน์โหลด Template ล่าสุดและกรอกข้อมูลใหม่";

export function createPatientImportTemplateHospitalMismatchMessage(hospital: {
  hospitalName: string;
  hospitalCode: string;
}): string {
  return `ไฟล์นี้ไม่ได้จัดทำสำหรับ ${hospital.hospitalName} (${hospital.hospitalCode}) กรุณาดาวน์โหลด Template ของโรงพยาบาลที่เลือกแล้วกรอกข้อมูลใหม่`;
}

export const PATIENT_IMPORT_FAILED_ROWS_DOWNLOAD_PATH =
  "/api/v1/hospital/patient-import/failed-rows" as const;

export function createPatientImportTemplateDownloadPath(hospitalId: string): string {
  return `/api/v1/hospital/patient-import/template?hospitalId=${encodeURIComponent(hospitalId)}`;
}

export function createPatientImportTemplateFilename(hospitalCode: string): string {
  const safeCode = hospitalCode.replace(/[^A-Za-z0-9_-]/gu, "_");
  return `DEMI_patient_import_${safeCode}_v2.xlsx`;
}

export const PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER = "เหตุผล" as const;
export const PATIENT_IMPORT_FAILED_ROWS_FILENAME_SUFFIX = "failed_rows" as const;

export function createPatientImportFailedRowsFilename(hospitalCode: string): string {
  const safeCode = hospitalCode.replace(/[^A-Za-z0-9_-]/gu, "_");
  return `DEMI_patient_import_${safeCode}_v2_${PATIENT_IMPORT_FAILED_ROWS_FILENAME_SUFFIX}.xlsx`;
}

export const PATIENT_IMPORT_TEMPLATE_CLASSIFICATION_VALUES = ["กลุ่มเสี่ยง", "เบาหวาน"] as const;

export type PatientImportTemplateColumnFormat = "text" | "date" | "integer" | "numeric";

export type PatientImportTemplateColumn = {
  readonly column: string;
  readonly field: PatientImportFieldKey;
  readonly header: string;
  readonly format: PatientImportTemplateColumnFormat;
  readonly width: number;
};

export const PATIENT_IMPORT_TEMPLATE_COLUMNS = [
  { column: "A", field: "sourceSequenceNumber", header: "ที่", format: "integer", width: 8 },
  { column: "B", field: "nationalId", header: "เลขบัตรประชาชน", format: "text", width: 20 },
  { column: "C", field: "dateOfBirth", header: "วันเกิด", format: "date", width: 15 },
  { column: "D", field: "givenName", header: "ชื่อ", format: "text", width: 18 },
  { column: "E", field: "familyName", header: "นามสกุล", format: "text", width: 18 },
  { column: "F", field: "hospitalNumber", header: "HN", format: "text", width: 16 },
  { column: "G", field: "gender", header: "เพศ", format: "text", width: 10 },
  { column: "H", field: "phoneNumber", header: "เบอร์โทร", format: "text", width: 16 },
  { column: "I", field: "weight", header: "น้ำหนัก", format: "numeric", width: 12 },
  { column: "J", field: "height", header: "ส่วนสูง", format: "numeric", width: 12 },
  {
    column: "K",
    field: "waistCircumference",
    header: "รอบเอว(ซม.)",
    format: "numeric",
    width: 15,
  },
  {
    column: "L",
    field: "diabetesClassification",
    header: "ประเภทเบาหวาน",
    format: "text",
    width: 30,
  },
  {
    column: "M",
    field: "bloodSugarDtx",
    header: "ค่าน้ำตาลในเลือด",
    format: "numeric",
    width: 20,
  },
  {
    column: "N",
    field: "hba1c",
    header: "ค่า HbA1c ล่าสุด (ถ้ามี)",
    format: "numeric",
    width: 22,
  },
  { column: "O", field: "houseNumber", header: "บ้านเลขที่", format: "text", width: 14 },
  { column: "P", field: "villageNumber", header: "หมู่ที่/ชุมชน", format: "text", width: 16 },
  { column: "Q", field: "villageName", header: "หมู่บ้าน", format: "text", width: 18 },
  { column: "R", field: "soi", header: "ซอย", format: "text", width: 16 },
  { column: "S", field: "road", header: "ถนน", format: "text", width: 18 },
  { column: "T", field: "province", header: "จังหวัด", format: "text", width: 18 },
  { column: "U", field: "district", header: "อำเภอ", format: "text", width: 18 },
  { column: "V", field: "subdistrict", header: "ตำบล", format: "text", width: 18 },
  { column: "W", field: "postalCode", header: "รหัสไปรษณีย์", format: "text", width: 16 },
  {
    column: "X",
    field: "emergencyContactName",
    header: "ชื่อผู้ติดต่อ(ญาติ)",
    format: "text",
    width: 22,
  },
  { column: "Y", field: "emergencyContactPhone", header: "เบอร์โทร", format: "text", width: 16 },
  {
    column: "Z",
    field: "emergencyContactRelationship",
    header: "ความสัมพันธ์",
    format: "text",
    width: 18,
  },
] as const satisfies readonly PatientImportTemplateColumn[];

export const PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT =
  PATIENT_IMPORT_TEMPLATE_COLUMNS.length;

/** Failed-rows exports append exactly one trailing column; the parser ignores it. */
export const PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN = "AA" as const;
export const PATIENT_IMPORT_FAILED_ROWS_COLUMN_COUNT =
  PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT + 1;

export const PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS: Readonly<Record<string, string>> = {
  L: "กลุ่มเสี่ยง หรือ เบาหวาน (ไม่ต้องมี Type)",
};

/** Every column is a merged two-row header except the one carrying a secondary caption. */
export const PATIENT_IMPORT_TEMPLATE_MERGES = [
  ...PATIENT_IMPORT_TEMPLATE_COLUMNS.filter(
    ({ column }) => PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS[column] === undefined,
  ).map(({ column }) => `${column}1:${column}2`),
] as const;

export const PATIENT_IMPORT_FAILED_ROWS_MERGE =
  `${PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN}1:${PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN}2` as const;
