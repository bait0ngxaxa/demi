import type { Cell, Workbook, Worksheet } from "exceljs";

import { ValidationError } from "@/shared/errors/application-error";

import type { PatientImportFieldKey } from "./patient-import-contract";
import {
  createPatientImportTemplateHospitalMismatchMessage,
  PATIENT_IMPORT_FAILED_ROWS_COLUMN_COUNT,
  PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER,
  PATIENT_IMPORT_TEMPLATE_COLUMNS,
  PATIENT_IMPORT_TEMPLATE_DATA_START_ROW,
  PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT,
  PATIENT_IMPORT_TEMPLATE_HEADER_ROW,
  PATIENT_IMPORT_TEMPLATE_METADATA_HOSPITAL_CODE_KEY,
  PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_METADATA_VERSION_KEY,
  PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE,
  PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS,
  PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADER_ROW,
  PATIENT_IMPORT_TEMPLATE_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_VERSION,
} from "./patient-import-template-contract";

export type PatientImportTemplateTarget = {
  hospitalId: string;
  hospitalCode: string;
  hospitalName: string;
};

export type PatientImportColumnBinding = {
  field: PatientImportFieldKey;
  columnNumber: number;
  sourceHeader: string;
};

export const PATIENT_IMPORT_COLUMN_BINDINGS: ReadonlyMap<
  PatientImportFieldKey,
  PatientImportColumnBinding
> = new Map(
  PATIENT_IMPORT_TEMPLATE_COLUMNS.map((column, index) => [
    column.field,
    { field: column.field, columnNumber: index + 1, sourceHeader: column.header },
  ]),
);

export type PatientImportTemplateValidation = {
  headerRowNumber: number;
  dataStartRowNumber: number;
  hospitalCode: string;
  templateVersion: string;
};

function normalizeTemplateText(value: string): string {
  return value
    .replace(/^﻿/u, "")
    .normalize("NFC")
    .replace(/[\s   -​  　]+/gu, " ")
    .trim();
}

export function readPatientImportHeaderCellText(cell: Cell): string {
  if (cell.isMerged) {
    const cellAddress = cell.fullAddress;
    const masterAddress = cell.master.fullAddress;

    if (cellAddress.row !== masterAddress.row || cellAddress.col !== masterAddress.col) {
      return "";
    }

    return cell.master.text;
  }

  return cell.text;
}

function readHeaderRowTexts(worksheet: Worksheet, rowNumber: number, columnCount: number): string[] {
  const row = worksheet.getRow(rowNumber);
  const texts: string[] = [];

  for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
    texts.push(normalizeTemplateText(readPatientImportHeaderCellText(row.getCell(columnNumber))));
  }

  return texts;
}

function templateMismatch(): ValidationError {
  return new ValidationError(PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE);
}

/**
 * The patient sheet is found by its exact template name only, so the hidden
 * metadata sheet (or any other sheet) can never be mistaken for patient data.
 */
export function findPatientImportDataWorksheet(workbook: Workbook): Worksheet | null {
  return workbook.worksheets.find(({ name }) => name === PATIENT_IMPORT_TEMPLATE_SHEET_NAME) ?? null;
}

function readMetadataValue(worksheet: Worksheet, rowNumber: number, key: string): string | null {
  const row = worksheet.getRow(rowNumber);

  if (normalizeTemplateText(row.getCell(1).text) !== key) {
    return null;
  }

  const value = normalizeTemplateText(row.getCell(2).text);
  return value === "" ? null : value;
}

/**
 * The embedded metadata is the only hospital identity carried by a file. It must
 * be present, be the current template version and name the hospital selected on the server.
 */
export function assertPatientImportTemplateMetadata(
  workbook: Workbook,
  target: Pick<PatientImportTemplateTarget, "hospitalCode" | "hospitalName">,
): { templateVersion: string; hospitalCode: string } {
  const metadataSheet = workbook.worksheets.find(
    ({ name }) => name === PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME,
  );

  if (!metadataSheet) {
    throw templateMismatch();
  }

  const templateVersion = readMetadataValue(
    metadataSheet,
    1,
    PATIENT_IMPORT_TEMPLATE_METADATA_VERSION_KEY,
  );
  const hospitalCode = readMetadataValue(
    metadataSheet,
    2,
    PATIENT_IMPORT_TEMPLATE_METADATA_HOSPITAL_CODE_KEY,
  );

  if (templateVersion !== PATIENT_IMPORT_TEMPLATE_VERSION || hospitalCode === null) {
    throw templateMismatch();
  }

  if (hospitalCode !== target.hospitalCode) {
    throw new ValidationError(
      createPatientImportTemplateHospitalMismatchMessage({
        hospitalName: target.hospitalName,
      }),
    );
  }

  return { templateVersion, hospitalCode };
}

/**
 * Header contract: exact order and text in the fixed header rows, with at most
 * one extra trailing "เหตุผล" column (failed-rows exports). Any other extra
 * column is a mismatch.
 */
export function assertPatientImportTemplateHeaders(worksheet: Worksheet): void {
  const columnCount = worksheet.actualColumnCount;
  const hasReasonColumn = columnCount === PATIENT_IMPORT_FAILED_ROWS_COLUMN_COUNT;

  if (columnCount !== PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT && !hasReasonColumn) {
    throw templateMismatch();
  }

  const primaryHeaders = readHeaderRowTexts(
    worksheet,
    PATIENT_IMPORT_TEMPLATE_HEADER_ROW,
    columnCount,
  );
  const secondaryHeaders = readHeaderRowTexts(
    worksheet,
    PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADER_ROW,
    PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT,
  );

  for (const [index, column] of PATIENT_IMPORT_TEMPLATE_COLUMNS.entries()) {
    const expectedSecondary = PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS[column.column] ?? "";

    if (
      primaryHeaders[index] !== normalizeTemplateText(column.header) ||
      secondaryHeaders[index] !== normalizeTemplateText(expectedSecondary)
    ) {
      throw templateMismatch();
    }
  }

  if (
    hasReasonColumn &&
    primaryHeaders[PATIENT_IMPORT_TEMPLATE_EXPECTED_COLUMN_COUNT] !==
      PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER
  ) {
    throw templateMismatch();
  }
}

export function validatePatientImportTemplateWorkbook(
  workbook: Workbook,
  target: Pick<PatientImportTemplateTarget, "hospitalCode" | "hospitalName">,
): PatientImportTemplateValidation & { worksheet: Worksheet } {
  const metadata = assertPatientImportTemplateMetadata(workbook, target);
  const worksheet = findPatientImportDataWorksheet(workbook);

  if (!worksheet) {
    throw templateMismatch();
  }

  assertPatientImportTemplateHeaders(worksheet);

  return {
    worksheet,
    headerRowNumber: PATIENT_IMPORT_TEMPLATE_HEADER_ROW,
    dataStartRowNumber: PATIENT_IMPORT_TEMPLATE_DATA_START_ROW,
    ...metadata,
  };
}
