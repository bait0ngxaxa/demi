import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  createPatientImportFailedRowsWorkbook,
  createPatientImportTemplateWorkbook,
  writePatientImportWorkbookBuffer,
} from "./patient-import-template";
import {
  createPatientImportFailedRowsFilename,
  createPatientImportTemplateDownloadPath,
  createPatientImportTemplateFilename,
  PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER,
  PATIENT_IMPORT_TEMPLATE_CLASSIFICATION_VALUES,
  PATIENT_IMPORT_TEMPLATE_COLUMNS,
  PATIENT_IMPORT_TEMPLATE_DATA_END_ROW,
  PATIENT_IMPORT_TEMPLATE_DATA_START_ROW,
  PATIENT_IMPORT_TEMPLATE_INFO_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_MERGES,
  PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS,
  PATIENT_IMPORT_TEMPLATE_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_VERSION,
} from "./patient-import-template-contract";
import {
  readPatientImportHeaderCellText,
  validatePatientImportTemplateWorkbook,
} from "./patient-import-template-validation";

const hospital = { hospitalCode: "SYN-A", hospitalName: "โรงพยาบาลสังเคราะห์เอ" };

const criticalTextFields = [
  "nationalId",
  "hospitalNumber",
  "phoneNumber",
  "postalCode",
  "emergencyContactPhone",
] as const;

function sheetProtectionOf(worksheet: ExcelJS.Worksheet | undefined): unknown {
  return (worksheet as unknown as { sheetProtection?: unknown } | undefined)?.sheetProtection;
}

async function roundTrip(workbook: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const loaded = new ExcelJS.Workbook();
  type ExcelJsInputBuffer = Parameters<typeof loaded.xlsx.load>[0];
  await loaded.xlsx.load((await writePatientImportWorkbookBuffer(workbook)) as unknown as ExcelJsInputBuffer);
  return loaded;
}

function headerValues(worksheet: ExcelJS.Worksheet, rowNumber: number): string[] {
  return PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ column }) =>
    worksheet.getCell(`${column}${rowNumber}`).text,
  );
}

function dataAreaValues(worksheet: ExcelJS.Worksheet): unknown[] {
  return PATIENT_IMPORT_TEMPLATE_COLUMNS.flatMap(({ column }) =>
    Array.from(
      { length: PATIENT_IMPORT_TEMPLATE_DATA_END_ROW - PATIENT_IMPORT_TEMPLATE_DATA_START_ROW + 1 },
      (_, index) => worksheet.getCell(`${column}${PATIENT_IMPORT_TEMPLATE_DATA_START_ROW + index}`).value,
    ),
  );
}

describe("Hospital-bound patient import template v2", () => {
  it("is the v1 column set minus the hospital and OSM columns, recomputed A:Z", () => {
    expect(PATIENT_IMPORT_TEMPLATE_VERSION).toBe("patient-import-template-v2");
    expect(PATIENT_IMPORT_TEMPLATE_COLUMNS).toHaveLength(26);
    expect(PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ column }) => column).at(-1)).toBe("Z");
    expect(PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ header }) => header)).not.toContain("โรงพยาบาล");
    expect(PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ header }) => header)).not.toContain("ชื่อผู้ดูแล (อสม.)");
    expect(PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ field }) => field)).toEqual([
      "sourceSequenceNumber",
      "nationalId",
      "dateOfBirth",
      "givenName",
      "familyName",
      "hospitalNumber",
      "gender",
      "phoneNumber",
      "weight",
      "height",
      "waistCircumference",
      "diabetesClassification",
      "bloodSugarDtx",
      "hba1c",
      "houseNumber",
      "villageNumber",
      "villageName",
      "soi",
      "road",
      "province",
      "district",
      "subdistrict",
      "postalCode",
      "emergencyContactName",
      "emergencyContactPhone",
      "emergencyContactRelationship",
    ]);
    expect(PATIENT_IMPORT_TEMPLATE_COLUMNS.find(({ field }) => field === "houseNumber")?.column).toBe("O");
    expect(PATIENT_IMPORT_TEMPLATE_COLUMNS.find(({ field }) => field === "emergencyContactRelationship")?.column).toBe("Z");
    expect(PATIENT_IMPORT_TEMPLATE_DATA_END_ROW).toBe(502);
    expect(PATIENT_IMPORT_TEMPLATE_MERGES).toEqual([
      ...PATIENT_IMPORT_TEMPLATE_COLUMNS.filter(({ column }) => column !== "L").map(
        ({ column }) => `${column}1:${column}2`,
      ),
    ]);
  });

  it("builds the data sheet from the shared contract and survives a write/read round trip", async () => {
    const workbook = await roundTrip(await createPatientImportTemplateWorkbook(hospital));
    const worksheet = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_SHEET_NAME);

    expect(worksheet).toBeDefined();
    expect(workbook.worksheets[0]?.name).toBe(PATIENT_IMPORT_TEMPLATE_SHEET_NAME);

    if (!worksheet) {
      return;
    }

    expect(worksheet.actualColumnCount).toBe(PATIENT_IMPORT_TEMPLATE_COLUMNS.length);
    expect(worksheet.model.merges).toEqual(PATIENT_IMPORT_TEMPLATE_MERGES);
    expect(worksheet.views[0]).toMatchObject({ state: "frozen", ySplit: 2 });
    expect(headerValues(worksheet, 1)).toEqual(PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ header }) => header));
    expect(worksheet.getCell("L2").value).toBe(PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS.L);
    expect(
      PATIENT_IMPORT_TEMPLATE_COLUMNS
        .filter(({ column }) => column !== "L")
        .map(({ column }) => readPatientImportHeaderCellText(worksheet.getCell(`${column}2`))),
    ).toEqual(PATIENT_IMPORT_TEMPLATE_COLUMNS.filter(({ column }) => column !== "L").map(() => ""));

    for (const field of criticalTextFields) {
      const column = PATIENT_IMPORT_TEMPLATE_COLUMNS.find((item) => item.field === field);
      expect(column).toBeDefined();
      expect(worksheet.getCell(`${column?.column}3`).numFmt).toBe("@");
      expect(worksheet.getCell(`${column?.column}502`).numFmt).toBe("@");
    }

    const classificationColumn = PATIENT_IMPORT_TEMPLATE_COLUMNS.find(
      ({ field }) => field === "diabetesClassification",
    );
    expect(worksheet.getCell(`${classificationColumn?.column}3`).dataValidation).toMatchObject({
      type: "list",
      allowBlank: true,
      formulae: [`"${PATIENT_IMPORT_TEMPLATE_CLASSIFICATION_VALUES.join(",")}"`],
    });
    expect(dataAreaValues(worksheet)).toEqual(
      Array.from({ length: PATIENT_IMPORT_TEMPLATE_COLUMNS.length * 500 }, () => null),
    );
    expect(validatePatientImportTemplateWorkbook(workbook, hospital)).toMatchObject({
      headerRowNumber: 1,
      dataStartRowNumber: 3,
      hospitalCode: hospital.hospitalCode,
      templateVersion: PATIENT_IMPORT_TEMPLATE_VERSION,
    });
  });

  it("embeds the hospital in a veryHidden, protected metadata sheet", async () => {
    const workbook = await roundTrip(await createPatientImportTemplateWorkbook(hospital));
    const metadata = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME);

    expect(metadata?.state).toBe("veryHidden");
    expect(sheetProtectionOf(metadata)).toMatchObject({ sheet: true });
    expect(metadata?.getCell("A1").text).toBe("templateVersion");
    expect(metadata?.getCell("B1").text).toBe("patient-import-template-v2");
    expect(metadata?.getCell("A2").text).toBe("hospitalCode");
    expect(metadata?.getCell("B2").text).toBe(hospital.hospitalCode);
    expect(workbook.worksheets.filter(({ state }) => state === "visible").map(({ name }) => name)).toEqual([
      PATIENT_IMPORT_TEMPLATE_SHEET_NAME,
      PATIENT_IMPORT_TEMPLATE_INFO_SHEET_NAME,
    ]);
  });

  it("keeps the Hospital name in visible and printed copy without showing its code", async () => {
    const workbook = await roundTrip(await createPatientImportTemplateWorkbook(hospital));
    const info = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_INFO_SHEET_NAME);
    const patientSheet = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_SHEET_NAME);

    expect(sheetProtectionOf(info)).toMatchObject({ sheet: true });
    expect(info?.getCell("A1").text).toBe("โรงพยาบาล");
    expect(info?.getCell("B1").text).toBe(hospital.hospitalName);
    expect(info?.getCell("A2").text).toBe("เวอร์ชัน Template");
    expect(info?.getCell("B2").text).toBe(PATIENT_IMPORT_TEMPLATE_VERSION);
    expect(patientSheet?.headerFooter.oddHeader).toContain(hospital.hospitalName);
    expect(patientSheet?.headerFooter.oddHeader).not.toContain(hospital.hospitalCode);
    let visibleCopy = "";
    for (const sheet of workbook.worksheets.filter(({ state }) => state === "visible")) {
      sheet.eachRow((row) => row.eachCell((cell) => { visibleCopy += `${cell.text}\n`; }));
    }
    expect(visibleCopy).not.toContain(hospital.hospitalCode);
    const metadata = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME);
    expect(metadata?.state).toBe("veryHidden");
    expect(metadata?.getCell("B2").text).toBe(hospital.hospitalCode);
    // The fixed header-row contract still holds: rows 1-2 are headers, data starts at row 3.
    expect(headerValues(patientSheet as ExcelJS.Worksheet, 1)).toEqual(
      PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ header }) => header),
    );
  });

  it("uses safe Hospital-name download filenames while preserving the version and binding path", () => {
    expect(createPatientImportTemplateFilename(hospital.hospitalName)).toBe(
      "DEMI_โรงพยาบาลสังเคราะห์เอ_patient_import_v2.xlsx",
    );
    expect(createPatientImportFailedRowsFilename(hospital.hospitalName)).toBe(
      "DEMI_โรงพยาบาลสังเคราะห์เอ_patient_import_v2_failed_rows.xlsx",
    );
    expect(createPatientImportTemplateFilename("โรงพยาบาล/ศูนย์:* ทดสอบ")).toBe(
      "DEMI_โรงพยาบาล_ศูนย์_ ทดสอบ_patient_import_v2.xlsx",
    );
    expect(createPatientImportTemplateFilename("โรงพยาบาลบี")).toBe(
      "DEMI_โรงพยาบาลบี_patient_import_v2.xlsx",
    );
    expect(createPatientImportTemplateFilename(`${"A".repeat(79)}บี`)).toBe(
      `DEMI_${"A".repeat(79)}_patient_import_v2.xlsx`,
    );
    expect(createPatientImportTemplateFilename(hospital.hospitalName)).not.toBe(
      createPatientImportTemplateFilename("โรงพยาบาลสังเคราะห์บี"),
    );
    expect(createPatientImportTemplateDownloadPath("11111111-1111-4111-8111-111111111111")).toBe(
      "/api/v1/hospital/patient-import/template?hospitalId=11111111-1111-4111-8111-111111111111",
    );
  });

  it("builds a failed-rows workbook with the same metadata, original values and a trailing reason column", async () => {
    const values = PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ field }) =>
      field === "nationalId" ? "123" : field === "givenName" ? "ตัวอย่าง" : null,
    );
    const workbook = await roundTrip(
      await createPatientImportFailedRowsWorkbook(hospital, [
        { values, reason: "เลขบัตรประชาชนไม่ถูกต้อง" },
        { values, reason: "ชื่อไม่ตรงกัน" },
      ]),
    );
    const worksheet = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_SHEET_NAME);

    expect(worksheet?.getCell("AA1").text).toBe(PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER);
    expect(worksheet?.getCell("B3").text).toBe("123");
    expect(worksheet?.getCell("AA3").text).toBe("เลขบัตรประชาชนไม่ถูกต้อง");
    expect(worksheet?.getCell("AA4").text).toBe("ชื่อไม่ตรงกัน");
    expect(worksheet?.getCell("B5").value).toBeNull();
    expect(
      workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME)?.getCell("B2").text,
    ).toBe(hospital.hospitalCode);
    expect(validatePatientImportTemplateWorkbook(workbook, hospital).hospitalCode).toBe(
      hospital.hospitalCode,
    );
  });

  it("refuses to export more rows than the template capacity", async () => {
    await expect(
      createPatientImportFailedRowsWorkbook(
        hospital,
        Array.from({ length: 501 }, () => ({ values: [], reason: "x" })),
      ),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
