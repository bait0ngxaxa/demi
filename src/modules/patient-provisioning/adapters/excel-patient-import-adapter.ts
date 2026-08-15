import "server-only";

import ExcelJS from "exceljs";

import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { ValidationError } from "@/shared/errors/application-error";

import {
  patientProvisionFormSchema,
  patientProvisionScopeSchema,
} from "../schemas/patient-provisioning-schemas";
import type { PatientProvisioningImportCandidate } from "../services/patient-provisioning-service";

export const MAX_PATIENT_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_PATIENT_IMPORT_ROWS = 500;
const MAX_PATIENT_IMPORT_COLUMNS = 16;

export type PatientImportUpload = {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type ImportColumn = "nationalId" | "givenName" | "familyName" | "hospitalNumber";

const headerAliases: Record<string, ImportColumn> = {
  "thai national id": "nationalId",
  "national id": "nationalId",
  "เลขบัตรประชาชน": "nationalId",
  "เลขประจำตัวประชาชน": "nationalId",
  "first name": "givenName",
  "given name": "givenName",
  ชื่อ: "givenName",
  "last name": "familyName",
  "family name": "familyName",
  นามสกุล: "familyName",
  hn: "hospitalNumber",
  "hospital number": "hospitalNumber",
  hospitalnumber: "hospitalNumber",
  "เลข hn": "hospitalNumber",
};

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/u, "").trim().toLowerCase().replace(/\s+/gu, " ");
}

function cellText(cell: ExcelJS.Cell): string {
  return cell.text.trim();
}

function maskIdentity(value: string): string {
  const normalized = value.replace(/\s+/gu, "");

  if (normalized.length < 4) {
    return "ไม่แสดง";
  }

  return `••••••${normalized.slice(-4)}`;
}

function mapValidationMessage(issues: readonly { path: readonly unknown[] }[]): string {
  const fields = new Set(issues.map((issue) => issue.path[0]));

  if (fields.has("nationalId")) {
    return "เลขบัตรประชาชนไม่ถูกต้อง";
  }

  if (fields.has("givenName")) {
    return "กรุณาระบุชื่อ";
  }

  if (fields.has("familyName")) {
    return "กรุณาระบุนามสกุล";
  }

  if (fields.has("hospitalNumber")) {
    return "HN ยาวเกินจำนวนที่รองรับ";
  }

  return "ข้อมูลแถวนี้ไม่ถูกต้อง";
}

function assertUploadShape(file: PatientImportUpload): void {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new ValidationError("รองรับเฉพาะไฟล์ Excel .xlsx");
  }

  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PATIENT_IMPORT_BYTES) {
    throw new ValidationError("ไฟล์ Excel ต้องมีขนาดไม่เกิน 5 MB");
  }
}

function resolveHeaderColumns(worksheet: ExcelJS.Worksheet): Map<ImportColumn, number> {
  const headerRow = worksheet.getRow(1);

  if (headerRow.cellCount === 0 || headerRow.cellCount > MAX_PATIENT_IMPORT_COLUMNS) {
    throw new ValidationError("ไม่พบหัวตาราง Excel ที่รองรับ");
  }

  const columns = new Map<ImportColumn, number>();

  for (let columnNumber = 1; columnNumber <= headerRow.cellCount; columnNumber += 1) {
    const header = normalizeHeader(cellText(headerRow.getCell(columnNumber)));
    const field = headerAliases[header];

    if (!field) {
      continue;
    }

    if (columns.has(field)) {
      throw new ValidationError("หัวตาราง Excel ซ้ำกัน");
    }

    columns.set(field, columnNumber);
  }

  for (const requiredField of ["nationalId", "givenName", "familyName"] as const) {
    if (!columns.has(requiredField)) {
      throw new ValidationError("Excel ต้องมีคอลัมน์เลขบัตรประชาชน ชื่อ และนามสกุล");
    }
  }

  return columns;
}

function requiredColumn(columns: ReadonlyMap<ImportColumn, number>, field: ImportColumn): number {
  const column = columns.get(field);

  if (column === undefined) {
    throw new ValidationError("Excel ต้องมีคอลัมน์ที่จำเป็น");
  }

  return column;
}

export async function readPatientImportCandidates(
  file: PatientImportUpload,
  targetHospitalId: string,
): Promise<PatientProvisioningImportCandidate[]> {
  const parsedScope = patientProvisionScopeSchema.safeParse({ targetHospitalId });

  if (!parsedScope.success) {
    throw new ValidationError("โรงพยาบาลที่เลือกไม่ถูกต้อง");
  }

  assertUploadShape(file);

  let buffer: Buffer;

  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    throw new ValidationError("ไม่สามารถอ่านไฟล์ Excel ได้");
  }

  if (buffer.byteLength > MAX_PATIENT_IMPORT_BYTES) {
    throw new ValidationError("ไฟล์ Excel ต้องมีขนาดไม่เกิน 5 MB");
  }

  const workbook = new ExcelJS.Workbook();

  try {
    type ExcelJsInputBuffer = Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(buffer as unknown as ExcelJsInputBuffer);
  } catch {
    throw new ValidationError("ไฟล์ Excel ไม่ถูกต้องหรือไม่สามารถอ่านได้");
  }

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new ValidationError("ไม่พบแผ่นงานในไฟล์ Excel");
  }

  if (worksheet.rowCount < 1 || worksheet.rowCount - 1 > MAX_PATIENT_IMPORT_ROWS) {
    throw new ValidationError(`ไฟล์ Excel รองรับผู้ป่วยไม่เกิน ${MAX_PATIENT_IMPORT_ROWS} แถว`);
  }

  const columns = resolveHeaderColumns(worksheet);
  const nationalIdColumn = requiredColumn(columns, "nationalId");
  const givenNameColumn = requiredColumn(columns, "givenName");
  const familyNameColumn = requiredColumn(columns, "familyName");
  const candidates: PatientProvisioningImportCandidate[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const nationalId = cellText(row.getCell(nationalIdColumn));
    const givenName = cellText(row.getCell(givenNameColumn));
    const familyName = cellText(row.getCell(familyNameColumn));
    const hospitalNumberColumn = columns.get("hospitalNumber");
    const hospitalNumber = hospitalNumberColumn
      ? cellText(row.getCell(hospitalNumberColumn))
      : "";

    if (!nationalId && !givenName && !familyName && !hospitalNumber) {
      continue;
    }

    const parsedRow = patientProvisionFormSchema.safeParse({
      nationalId,
      givenName,
      familyName,
      hospitalNumber,
      targetHospitalId: parsedScope.data.targetHospitalId,
    });

    candidates.push({
      rowNumber,
      identityDisplay: maskIdentity(nationalId),
      input: parsedRow.success
        ? {
            identity: {
              namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
              value: parsedRow.data.nationalId,
            },
            givenName: parsedRow.data.givenName,
            familyName: parsedRow.data.familyName,
            hospitalNumber: parsedRow.data.hospitalNumber,
            targetHospitalId: parsedRow.data.targetHospitalId,
          }
        : null,
      givenName: givenName.trim(),
      familyName: familyName.trim(),
      hospitalNumber: hospitalNumber.trim() || null,
      validationMessage: parsedRow.success
        ? null
        : mapValidationMessage(parsedRow.error.issues),
    });
  }

  return candidates;
}
