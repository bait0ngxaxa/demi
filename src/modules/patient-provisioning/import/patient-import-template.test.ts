import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  readPatientImportHeaderCellText,
  validateCanonicalPatientImportTemplate,
} from "./patient-import-layouts";
import { createPatientImportTemplateWorkbook } from "./patient-import-template";
import {
  PATIENT_IMPORT_TEMPLATE_CLASSIFICATION_VALUES,
  PATIENT_IMPORT_TEMPLATE_COLUMNS,
  PATIENT_IMPORT_TEMPLATE_DATA_END_ROW,
  PATIENT_IMPORT_TEMPLATE_DATA_START_ROW,
  PATIENT_IMPORT_TEMPLATE_DOWNLOAD_FILENAME,
  PATIENT_IMPORT_TEMPLATE_DOWNLOAD_PATH,
  PATIENT_IMPORT_TEMPLATE_MERGES,
  PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS,
  PATIENT_IMPORT_TEMPLATE_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_VERSION,
} from "./patient-import-template-contract";

const publicTemplatePath = resolve(
  process.cwd(),
  "public/templates/demi-patient-import-template-v1.xlsx",
);

const criticalTextFields = [
  "nationalId",
  "hospitalNumber",
  "phoneNumber",
  "postalCode",
  "emergencyContactPhone",
] as const;

type LoadedWorkbook = {
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
};

async function loadWorkbook(buffer: Buffer): Promise<LoadedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  type ExcelJsInputBuffer = Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(buffer as unknown as ExcelJsInputBuffer);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("The synthetic template workbook has no worksheet");
  }

  return { workbook, worksheet };
}

function headerValues(worksheet: ExcelJS.Worksheet, rowNumber: number): string[] {
  return PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ column }) =>
    worksheet.getCell(`${column}${rowNumber}`).text,
  );
}

function semanticTemplateShape(worksheet: ExcelJS.Worksheet): Record<string, unknown> {
  const formats = Object.fromEntries(
    criticalTextFields.map((field) => {
      const column = PATIENT_IMPORT_TEMPLATE_COLUMNS.find((item) => item.field === field);
      return [field, column ? worksheet.getCell(`${column.column}${PATIENT_IMPORT_TEMPLATE_DATA_START_ROW}`).numFmt : null];
    }),
  );
  const classificationColumn = PATIENT_IMPORT_TEMPLATE_COLUMNS.find(
    ({ field }) => field === "diabetesClassification",
  );

  return {
    sheetName: worksheet.name,
    primaryHeaders: headerValues(worksheet, 1),
    secondaryHeaders: headerValues(worksheet, 2),
    merges: worksheet.model.merges,
    formats,
    classificationValidation: classificationColumn
      ? worksheet.getCell(`${classificationColumn.column}${PATIENT_IMPORT_TEMPLATE_DATA_START_ROW}`).dataValidation
      : null,
  };
}

function dataAreaValues(worksheet: ExcelJS.Worksheet): unknown[] {
  return PATIENT_IMPORT_TEMPLATE_COLUMNS.flatMap(({ column }) =>
    Array.from(
      { length: PATIENT_IMPORT_TEMPLATE_DATA_END_ROW - PATIENT_IMPORT_TEMPLATE_DATA_START_ROW + 1 },
      (_, index) => worksheet.getCell(`${column}${PATIENT_IMPORT_TEMPLATE_DATA_START_ROW + index}`).value,
    ),
  );
}

describe("Canonical Patient import template v1", () => {
  it("builds the blank canonical workbook from the shared contract", async () => {
    const workbook = await createPatientImportTemplateWorkbook();
    const worksheet = workbook.worksheets[0];

    expect(PATIENT_IMPORT_TEMPLATE_VERSION).toBe("patient-import-template-v1");
    expect(PATIENT_IMPORT_TEMPLATE_DOWNLOAD_PATH).toBe(
      "/templates/demi-patient-import-template-v1.xlsx",
    );
    expect(PATIENT_IMPORT_TEMPLATE_DOWNLOAD_FILENAME).toContain("DEMI_");
    expect(workbook.worksheets).toHaveLength(1);
    expect(worksheet?.name).toBe(PATIENT_IMPORT_TEMPLATE_SHEET_NAME);
    expect(worksheet?.actualColumnCount).toBe(PATIENT_IMPORT_TEMPLATE_COLUMNS.length);
    expect(worksheet?.model.merges).toEqual(PATIENT_IMPORT_TEMPLATE_MERGES);
    expect(worksheet?.views[0]).toMatchObject({ state: "frozen", ySplit: 2 });

    if (!worksheet) {
      return;
    }

    expect(headerValues(worksheet, 1)).toEqual(
      PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ header }) => header),
    );
    expect(worksheet.getCell("L2").value).toBe(PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS.L);
    expect(
      PATIENT_IMPORT_TEMPLATE_COLUMNS
        .filter(({ column }) => column !== "L")
        .map(({ column }) => readPatientImportHeaderCellText(worksheet.getCell(`${column}2`))),
    ).toEqual(PATIENT_IMPORT_TEMPLATE_COLUMNS.filter(({ column }) => column !== "L").map(() => ""));

    const validation = validateCanonicalPatientImportTemplate(worksheet);
    expect(validation).toMatchObject({ headerRowNumber: 1, dataStartRowNumber: 3 });
    expect(validation.resolution.bindings.map(({ field }) => field)).toEqual(
      PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ field }) => field),
    );
    expect(validation.resolution.bindings.map(({ columnNumber }) => columnNumber)).toEqual(
      PATIENT_IMPORT_TEMPLATE_COLUMNS.map((_, index) => index + 1),
    );

    for (const field of criticalTextFields) {
      const column = PATIENT_IMPORT_TEMPLATE_COLUMNS.find((item) => item.field === field);
      expect(column).toBeDefined();
      expect(worksheet.getCell(`${column?.column}3`).numFmt).toBe("@");
      expect(worksheet.getCell(`${column?.column}502`).numFmt).toBe("@");
    }

    const classificationColumn = PATIENT_IMPORT_TEMPLATE_COLUMNS.find(
      ({ field }) => field === "diabetesClassification",
    );
    const classificationValidation = classificationColumn
      ? worksheet.getCell(`${classificationColumn.column}3`).dataValidation
      : undefined;
    expect(classificationValidation).toMatchObject({
      type: "list",
      allowBlank: true,
      formulae: [`"${PATIENT_IMPORT_TEMPLATE_CLASSIFICATION_VALUES.join(",")}"`],
    });
    expect(dataAreaValues(worksheet)).toEqual(
      Array.from({ length: PATIENT_IMPORT_TEMPLATE_COLUMNS.length * 500 }, () => null),
    );
  });

  it("recognizes the committed static artifact as the same semantic contract", async () => {
    const generated = await createPatientImportTemplateWorkbook();
    const generatedWorksheet = generated.worksheets[0];
    const artifactBuffer = await readFile(publicTemplatePath);
    const artifact = await loadWorkbook(artifactBuffer);

    expect(artifactBuffer.byteLength).toBeGreaterThan(0);
    expect(semanticTemplateShape(artifact.worksheet)).toEqual(
      semanticTemplateShape(generatedWorksheet),
    );
    expect(validateCanonicalPatientImportTemplate(artifact.worksheet)).toMatchObject({
      headerRowNumber: 1,
      dataStartRowNumber: 3,
    });
    expect(dataAreaValues(artifact.worksheet)).toEqual(
      Array.from({ length: PATIENT_IMPORT_TEMPLATE_COLUMNS.length * 500 }, () => null),
    );
  });
});
