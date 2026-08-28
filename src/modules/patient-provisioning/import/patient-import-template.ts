import ExcelJS from "exceljs";
import type { Cell } from "exceljs";

import {
  PATIENT_IMPORT_TEMPLATE_CLASSIFICATION_VALUES,
  PATIENT_IMPORT_TEMPLATE_COLUMNS,
  PATIENT_IMPORT_TEMPLATE_DATA_END_ROW,
  PATIENT_IMPORT_TEMPLATE_DATA_START_ROW,
  PATIENT_IMPORT_TEMPLATE_MERGES,
  PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS,
  PATIENT_IMPORT_TEMPLATE_SHEET_NAME,
} from "./patient-import-template-contract";

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

export async function createPatientImportTemplateWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DEMI";
  workbook.lastModifiedBy = "DEMI";
  workbook.created = new Date(0);
  workbook.modified = new Date(0);

  const worksheet = workbook.addWorksheet(PATIENT_IMPORT_TEMPLATE_SHEET_NAME, {
    views: [{
      state: "frozen",
      ySplit: 2,
      topLeftCell: "A3",
      activeCell: "A3",
    }],
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

  for (let rowNumber = PATIENT_IMPORT_TEMPLATE_DATA_START_ROW; rowNumber <= PATIENT_IMPORT_TEMPLATE_DATA_END_ROW; rowNumber += 1) {
    for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
      const cell = worksheet.getCell(`${column.column}${rowNumber}`);
      cell.value = null;
      applyDataFormat(cell, column.format);

      if (column.field === "diabetesClassification") {
        applyClassificationValidation(cell);
      }
    }
  }

  return workbook;
}
