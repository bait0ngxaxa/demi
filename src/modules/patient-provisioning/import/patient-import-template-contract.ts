import type { PatientImportFieldKey } from "./patient-import-contract";

export const PATIENT_IMPORT_TEMPLATE_VERSION = "patient-import-template-v1" as const;
export const PATIENT_IMPORT_TEMPLATE_SHEET_NAME = "รายชื่อผู้ป่วย" as const;
export const PATIENT_IMPORT_TEMPLATE_DOWNLOAD_PATH =
  "/templates/demi-patient-import-template-v1.xlsx" as const;
export const PATIENT_IMPORT_TEMPLATE_DOWNLOAD_FILENAME =
  "DEMI_แบบฟอร์มนำเข้ารายชื่อผู้ป่วย_v1.xlsx" as const;
export const PATIENT_IMPORT_TEMPLATE_HEADER_ROW = 1 as const;
export const PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADER_ROW = 2 as const;
export const PATIENT_IMPORT_TEMPLATE_DATA_START_ROW = 3 as const;
export const PATIENT_IMPORT_TEMPLATE_MAX_DATA_ROWS = 500 as const;
export const PATIENT_IMPORT_TEMPLATE_DATA_END_ROW =
  PATIENT_IMPORT_TEMPLATE_DATA_START_ROW + PATIENT_IMPORT_TEMPLATE_MAX_DATA_ROWS - 1;
export const PATIENT_IMPORT_TEMPLATE_MAX_HEADER_SCAN_ROWS = 8 as const;
export const PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE =
  "รูปแบบไฟล์ไม่ตรงกับ Template รายชื่อผู้ป่วยของระบบ กรุณาดาวน์โหลด Template ล่าสุดและกรอกข้อมูลใหม่";

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
  { column: "O", field: "hospitalName", header: "โรงพยาบาล", format: "text", width: 22 },
  { column: "P", field: "houseNumber", header: "บ้านเลขที่", format: "text", width: 14 },
  { column: "Q", field: "villageNumber", header: "หมู่ที่/ชุมชน", format: "text", width: 16 },
  { column: "R", field: "villageName", header: "หมู่บ้าน", format: "text", width: 18 },
  { column: "S", field: "soi", header: "ซอย", format: "text", width: 16 },
  { column: "T", field: "road", header: "ถนน", format: "text", width: 18 },
  { column: "U", field: "province", header: "จังหวัด", format: "text", width: 18 },
  { column: "V", field: "district", header: "อำเภอ", format: "text", width: 18 },
  { column: "W", field: "subdistrict", header: "ตำบล", format: "text", width: 18 },
  { column: "X", field: "postalCode", header: "รหัสไปรษณีย์", format: "text", width: 16 },
  {
    column: "Y",
    field: "emergencyContactName",
    header: "ชื่อผู้ติดต่อ(ญาติ)",
    format: "text",
    width: 22,
  },
  { column: "Z", field: "emergencyContactPhone", header: "เบอร์โทร", format: "text", width: 16 },
  {
    column: "AA",
    field: "emergencyContactRelationship",
    header: "ความสัมพันธ์",
    format: "text",
    width: 18,
  },
  {
    column: "AB",
    field: "osmCaregiverName",
    header: "ชื่อผู้ดูแล (อสม.)",
    format: "text",
    width: 22,
  },
] as const satisfies readonly PatientImportTemplateColumn[];

export const PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT =
  PATIENT_IMPORT_TEMPLATE_COLUMNS.length;

export const PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS: Readonly<Record<string, string>> = {
  L: "กลุ่มเสี่ยง หรือ เบาหวาน (ไม่ต้องมี Type)",
};

export const PATIENT_IMPORT_TEMPLATE_MERGES = [
  "A1:A2",
  "B1:B2",
  "C1:C2",
  "D1:D2",
  "E1:E2",
  "F1:F2",
  "G1:G2",
  "H1:H2",
  "I1:I2",
  "J1:J2",
  "K1:K2",
  "M1:M2",
  "N1:N2",
  "O1:O2",
  "P1:P2",
  "Q1:Q2",
  "R1:R2",
  "S1:S2",
  "T1:T2",
  "U1:U2",
  "V1:V2",
  "W1:W2",
  "X1:X2",
  "Y1:Y2",
  "Z1:Z2",
  "AA1:AA2",
  "AB1:AB2",
] as const;
