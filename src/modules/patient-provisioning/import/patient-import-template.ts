import ExcelJS from "exceljs";
import type { Cell, CellValue, Worksheet } from "exceljs";

import {
  PATIENT_IMPORT_FAILED_ROWS_MERGE,
  PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN,
  PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER,
  PATIENT_IMPORT_TEMPLATE_CLASSIFICATION_VALUES,
  PATIENT_IMPORT_TEMPLATE_COLUMNS,
  PATIENT_IMPORT_TEMPLATE_DATA_END_ROW,
  PATIENT_IMPORT_TEMPLATE_DATA_START_ROW,
  PATIENT_IMPORT_TEMPLATE_HEALTH_HISTORY_ANSWER_VALUES,
  PATIENT_IMPORT_TEMPLATE_INFO_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_MAX_DATA_ROWS,
  PATIENT_IMPORT_TEMPLATE_MERGES,
  PATIENT_IMPORT_TEMPLATE_METADATA_HOSPITAL_CODE_KEY,
  PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_METADATA_VERSION_KEY,
  PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS,
  PATIENT_IMPORT_TEMPLATE_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_VERSION,
} from "./patient-import-template-contract";
import { isPatientImportHealthHistoryField } from "./patient-import-contract";

export type PatientImportTemplateHospital = {
  hospitalCode: string;
  hospitalName: string;
};

/** Original cell values (one per template column) plus the reason the row was not imported. */
export type PatientImportFailedTemplateRow = {
  values: readonly CellValue[];
  reason: string;
};

const HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FF0E3C35" },
};

const SECONDARY_HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFDCEEE9" },
};

const HEADER_BORDER = {
  top: { style: "thin" as const, color: { argb: "FF6E9C93" } },
  left: { style: "thin" as const, color: { argb: "FF6E9C93" } },
  bottom: { style: "thin" as const, color: { argb: "FF6E9C93" } },
  right: { style: "thin" as const, color: { argb: "FF6E9C93" } },
};

const DATA_BORDER = {
  top: { style: "thin" as const, color: { argb: "FFD5E0DC" } },
  left: { style: "thin" as const, color: { argb: "FFD5E0DC" } },
  bottom: { style: "thin" as const, color: { argb: "FFD5E0DC" } },
  right: { style: "thin" as const, color: { argb: "FFD5E0DC" } },
};

function applyHeaderStyle(cell: Cell, secondary: boolean): void {
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  cell.border = HEADER_BORDER;
  cell.fill = secondary ? SECONDARY_HEADER_FILL : HEADER_FILL;
  cell.font = secondary
    ? { bold: true, italic: true, color: { argb: "FF0E3C35" }, size: 10 }
    : { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
}

function applyDataFormat(
  cell: Cell,
  format: (typeof PATIENT_IMPORT_TEMPLATE_COLUMNS)[number]["format"],
): void {
  cell.alignment = { vertical: "middle" };
  cell.border = DATA_BORDER;

  if (format === "text") {
    cell.numFmt = "@";
    return;
  }

  if (format === "date") {
    cell.numFmt = "dd/mm/yyyy";
    return;
  }

  if (format === "integer") {
    cell.numFmt = "0";
    return;
  }

  cell.numFmt = "0.##";
}

function applyClassificationValidation(cell: Cell): void {
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`"${PATIENT_IMPORT_TEMPLATE_CLASSIFICATION_VALUES.join(",")}"`],
    showErrorMessage: true,
    errorStyle: "stop",
    errorTitle: "ค่ากลุ่มสถานะไม่ถูกต้อง",
    error: "กรุณาเลือก กลุ่มเสี่ยง หรือ เบาหวาน",
  };
}

function applyHealthHistoryAnswerValidation(cell: Cell): void {
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`"${PATIENT_IMPORT_TEMPLATE_HEALTH_HISTORY_ANSWER_VALUES.join(",")}"`],
    showErrorMessage: true,
    errorStyle: "stop",
    errorTitle: "ค่าประวัติสุขภาพไม่ถูกต้อง",
    error: "กรุณาเลือก มี ไม่มี หรือ ไม่ทราบ",
  };
}

function buildDataSheet(
  workbook: ExcelJS.Workbook,
  hospital: PatientImportTemplateHospital,
  failedRows: readonly PatientImportFailedTemplateRow[] | null,
): Worksheet {
  const worksheet = workbook.addWorksheet(PATIENT_IMPORT_TEMPLATE_SHEET_NAME, {
    views: [{
      state: "frozen",
      ySplit: 2,
      topLeftCell: "A3",
      activeCell: "A3",
    }],
    // Printed pages and print preview carry the Hospital name; the header rows
    // stay exactly where the parser expects them.
    headerFooter: {
      oddHeader: `&L&"-,Bold" ${escapeHeaderFooterText(hospital.hospitalName)}`,
    },
  });
  worksheet.properties.defaultRowHeight = 20;

  for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
    worksheet.getColumn(column.column).width = column.width;

    const primaryHeaderCell = worksheet.getCell(`${column.column}1`);
    primaryHeaderCell.value = column.header;
    applyHeaderStyle(primaryHeaderCell, false);

    const secondaryHeaderCell = worksheet.getCell(`${column.column}2`);
    secondaryHeaderCell.value = PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS[column.column] ?? null;
    applyHeaderStyle(secondaryHeaderCell, true);
  }

  worksheet.getRow(1).height = 42;
  worksheet.getRow(2).height = 34;

  for (const merge of PATIENT_IMPORT_TEMPLATE_MERGES) {
    worksheet.mergeCells(merge);
  }

  if (failedRows) {
    worksheet.getColumn(PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN).width = 48;
    const reasonHeaderCell = worksheet.getCell(`${PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN}1`);
    reasonHeaderCell.value = PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER;
    applyHeaderStyle(reasonHeaderCell, false);
    applyHeaderStyle(worksheet.getCell(`${PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN}2`), true);
    worksheet.mergeCells(PATIENT_IMPORT_FAILED_ROWS_MERGE);
  }

  for (
    let rowNumber = PATIENT_IMPORT_TEMPLATE_DATA_START_ROW;
    rowNumber <= PATIENT_IMPORT_TEMPLATE_DATA_END_ROW;
    rowNumber += 1
  ) {
    const failedRow = failedRows?.[rowNumber - PATIENT_IMPORT_TEMPLATE_DATA_START_ROW] ?? null;

    for (const [index, column] of PATIENT_IMPORT_TEMPLATE_COLUMNS.entries()) {
      const cell = worksheet.getCell(`${column.column}${rowNumber}`);
      cell.value = failedRow?.values[index] ?? null;
      applyDataFormat(cell, column.format);

      if (column.field === "diabetesClassification") {
        applyClassificationValidation(cell);
      } else if (column.field !== "otherConditions" && isPatientImportHealthHistoryField(column.field)) {
        applyHealthHistoryAnswerValidation(cell);
      }
    }

    if (failedRow) {
      const reasonCell = worksheet.getCell(`${PATIENT_IMPORT_FAILED_ROWS_REASON_COLUMN}${rowNumber}`);
      reasonCell.value = failedRow.reason;
      reasonCell.alignment = { vertical: "middle", wrapText: true };
      reasonCell.font = { color: { argb: "FF9B1C1C" } };
    }
  }

  return worksheet;
}

function escapeHeaderFooterText(value: string): string {
  return value.replace(/&/gu, "&&");
}

async function buildInfoSheet(
  workbook: ExcelJS.Workbook,
  hospital: PatientImportTemplateHospital,
): Promise<void> {
  const worksheet = workbook.addWorksheet(PATIENT_IMPORT_TEMPLATE_INFO_SHEET_NAME);
  worksheet.getColumn("A").width = 26;
  worksheet.getColumn("B").width = 60;

  const rows: ReadonlyArray<readonly [string, string]> = [
    ["โรงพยาบาล", hospital.hospitalName],
    ["เวอร์ชัน Template", PATIENT_IMPORT_TEMPLATE_VERSION],
    ["การใช้งาน", "ไฟล์นี้ใช้นำเข้าผู้ป่วยของโรงพยาบาลนี้เท่านั้น ห้ามแก้ไขหัวตาราง"],
    ["การนำเข้าซ้ำ", "เพิ่มผู้ป่วยใหม่ต่อท้ายไฟล์เดิมได้ ระบบนำเข้าเฉพาะผู้ป่วยใหม่"],
    ["ประวัติโรคและประวัติครอบครัว", "เลือก มี / ไม่มี / ไม่ทราบ ช่องที่เว้นว่างถือว่า ไม่ทราบ (ไม่ใช่ ไม่มี)"],
  ];

  for (const [index, [label, value]] of rows.entries()) {
    const labelCell = worksheet.getCell(`A${index + 1}`);
    labelCell.value = label;
    labelCell.font = { bold: true };
    worksheet.getCell(`B${index + 1}`).value = value;
  }

  await worksheet.protect("", {});
}

async function buildMetadataSheet(
  workbook: ExcelJS.Workbook,
  hospital: PatientImportTemplateHospital,
): Promise<void> {
  const worksheet = workbook.addWorksheet(PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME, {
    state: "veryHidden",
  });
  worksheet.getCell("A1").value = PATIENT_IMPORT_TEMPLATE_METADATA_VERSION_KEY;
  worksheet.getCell("B1").value = PATIENT_IMPORT_TEMPLATE_VERSION;
  worksheet.getCell("A2").value = PATIENT_IMPORT_TEMPLATE_METADATA_HOSPITAL_CODE_KEY;
  worksheet.getCell("B2").value = hospital.hospitalCode;
  await worksheet.protect("", {});
}

async function createWorkbook(
  hospital: PatientImportTemplateHospital,
  failedRows: readonly PatientImportFailedTemplateRow[] | null,
): Promise<ExcelJS.Workbook> {
  if (failedRows && failedRows.length > PATIENT_IMPORT_TEMPLATE_MAX_DATA_ROWS) {
    throw new RangeError("Failed-rows export exceeds the template row capacity");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DEMI";
  workbook.lastModifiedBy = "DEMI";
  workbook.created = new Date(0);
  workbook.modified = new Date(0);

  buildDataSheet(workbook, hospital, failedRows);
  await buildInfoSheet(workbook, hospital);
  await buildMetadataSheet(workbook, hospital);

  return workbook;
}

export function createPatientImportTemplateWorkbook(
  hospital: PatientImportTemplateHospital,
): Promise<ExcelJS.Workbook> {
  return createWorkbook(hospital, null);
}

export function createPatientImportFailedRowsWorkbook(
  hospital: PatientImportTemplateHospital,
  failedRows: readonly PatientImportFailedTemplateRow[],
): Promise<ExcelJS.Workbook> {
  return createWorkbook(hospital, failedRows);
}

export async function writePatientImportWorkbookBuffer(
  workbook: ExcelJS.Workbook,
): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
