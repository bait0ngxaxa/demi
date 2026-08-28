import ExcelJS from "exceljs";
import type { CellValue } from "exceljs";
import { describe, expect, it } from "vitest";

import { ValidationError } from "@/shared/errors/application-error";

import {
  MAX_PATIENT_IMPORT_BYTES,
  MAX_PATIENT_IMPORT_COLUMNS,
  MAX_PATIENT_IMPORT_ROWS,
  readPatientImportCandidates,
  type PatientImportUpload,
} from "./excel-patient-import-adapter";
import type { PatientImportFieldKey } from "../import/patient-import-contract";
import { createPatientImportTemplateWorkbook } from "../import/patient-import-template";
import {
  PATIENT_IMPORT_TEMPLATE_COLUMNS,
  PATIENT_IMPORT_TEMPLATE_MERGES,
  PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE,
  PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS,
} from "../import/patient-import-template-contract";

const targetHospitalId = "11111111-1111-4111-8111-111111111111";

type SyntheticPatientValues = Partial<Record<PatientImportFieldKey, CellValue>>;

async function createUpload(
  workbook: ExcelJS.Workbook,
  name = "synthetic-canonical-patients.xlsx",
): Promise<PatientImportUpload> {
  const written = await workbook.xlsx.writeBuffer();
  const bytes = Uint8Array.from(new Uint8Array(written));

  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

function setPatientRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  values: SyntheticPatientValues,
): void {
  for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
    worksheet.getCell(`${column.column}${rowNumber}`).value = values[column.field] ?? null;
  }
}

function syntheticPatientValues(): SyntheticPatientValues {
  return {
    sourceSequenceNumber: 1,
    nationalId: "1000000000009",
    dateOfBirth: "04/05/2568",
    givenName: "ตัวอย่าง",
    familyName: "ผู้ป่วย",
    hospitalNumber: "HN-SYN-001",
    gender: "ไม่ระบุ",
    phoneNumber: "0812345678",
    weight: 72.5,
    height: 165,
    waistCircumference: 88,
    diabetesClassification: "กลุ่มเสี่ยง",
    bloodSugarDtx: 126,
    hba1c: 6.5,
    hospitalName: "โรงพยาบาลสังเคราะห์",
    houseNumber: "99/1",
    villageNumber: "7",
    villageName: "หมู่บ้านสังเคราะห์",
    soi: "ซอยสังเคราะห์",
    road: "ถนนสังเคราะห์",
    province: "จังหวัดสังเคราะห์",
    district: "อำเภอสังเคราะห์",
    subdistrict: "ตำบลสังเคราะห์",
    postalCode: "00000",
    emergencyContactName: "ผู้ติดต่อสังเคราะห์",
    emergencyContactPhone: "0823456789",
    emergencyContactRelationship: "ญาติ",
    osmCaregiverName: "ผู้ดูแลสังเคราะห์",
  };
}

async function createCanonicalUpload(
  values: SyntheticPatientValues | null = syntheticPatientValues(),
): Promise<PatientImportUpload> {
  const workbook = await createPatientImportTemplateWorkbook();
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("The synthetic canonical workbook has no worksheet");
  }

  if (values) {
    setPatientRow(worksheet, 3, values);
  }

  return createUpload(workbook);
}

function createHeaderRowsWorkbook({
  title = false,
  duplicate = false,
  unmerged = false,
}: {
  title?: boolean;
  duplicate?: boolean;
  unmerged?: boolean;
} = {}): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("รายชื่อผู้ป่วย");
  const headerRowNumber = title ? 2 : 1;
  const secondaryRowNumber = headerRowNumber + 1;

  if (title) {
    worksheet.getCell("A1").value = "DEMI Patient roster";
  }

  for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
    worksheet.getCell(`${column.column}${headerRowNumber}`).value = column.header;
    worksheet.getCell(`${column.column}${secondaryRowNumber}`).value =
      PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS[column.column] ?? null;
  }

  if (!unmerged) {
    for (const merge of PATIENT_IMPORT_TEMPLATE_MERGES) {
      const [start, end] = merge.split(":");
      const startColumn = start?.replace(/1$/u, String(headerRowNumber));
      const endColumn = end?.replace(/2$/u, String(secondaryRowNumber));

      if (startColumn && endColumn) {
        worksheet.mergeCells(`${startColumn}:${endColumn}`);
      }
    }
  }

  if (duplicate) {
    for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
      worksheet.getCell(`${column.column}${secondaryRowNumber}`).value = column.header;
    }
  }

  return workbook;
}

function assertValidationError(error: unknown, message: string): void {
  expect(error).toBeInstanceOf(ValidationError);
  expect(error).toMatchObject({ code: "VALIDATION", message });
}

describe("Canonical Patient import adapter", () => {
  it("parses the generated blank template and its first synthetic Patient row", async () => {
    const blankUpload = await createCanonicalUpload(null);
    await expect(readPatientImportCandidates(blankUpload, targetHospitalId)).resolves.toEqual([]);

    const upload = await createCanonicalUpload();
    const candidates = await readPatientImportCandidates(upload, targetHospitalId);
    const candidate = candidates[0];

    expect(candidate).toBeDefined();
    expect(candidate?.input).toMatchObject({
      givenName: "ตัวอย่าง",
      familyName: "ผู้ป่วย",
      hospitalNumber: "HN-SYN-001",
      targetHospitalId,
    });
    expect(candidate?.canonicalRow.provenance.sourceRowNumber).toBe(3);
    expect(candidate?.canonicalRow.identity.nationalId).toBe("1000000000009");
    expect(candidate?.canonicalRow.contact.phoneNumber).toBe("0812345678");
    expect(candidate?.canonicalRow.contact.emergencyContactPhone).toBe("0823456789");
    expect(candidate?.canonicalRow.clinicalCandidates).toMatchObject({
      diabetesClassification: "RISK",
      bloodSugarDtx: 126,
      bloodSugar: null,
      hba1c: 6.5,
    });
    expect(candidate?.fileMetadata).toMatchObject({
      worksheetName: "รายชื่อผู้ป่วย",
      headerRowNumber: 1,
      layout: "OPERATIONAL_ROSTER",
    });
  });

  it("accepts the operational merged two-row header without a duplicate-header error", async () => {
    const upload = await createCanonicalUpload();
    const candidates = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.canonicalRow.identity.givenName).toBe("ตัวอย่าง");
  });

  it("keeps the legacy compatibility scanner merge-aware for the operational header", async () => {
    const upload = await createCanonicalUpload();
    const candidates = await readPatientImportCandidates(upload, targetHospitalId, {
      mode: "COMPATIBILITY",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.canonicalRow.contact.phoneNumber).toBe("0812345678");
  });

  it("accepts a semantically identical unmerged header", async () => {
    const workbook = await createPatientImportTemplateWorkbook();
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("The synthetic canonical workbook has no worksheet");
    }

    for (const merge of PATIENT_IMPORT_TEMPLATE_MERGES) {
      worksheet.unMergeCells(merge);
    }
    setPatientRow(worksheet, 3, syntheticPatientValues());

    const candidates = await readPatientImportCandidates(
      await createUpload(workbook),
      targetHospitalId,
    );

    expect(candidates[0]?.canonicalRow.contact.phoneNumber).toBe("0812345678");
  });

  it("allows a bounded title row before the canonical header group", async () => {
    const workbook = createHeaderRowsWorkbook({ title: true });
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("The synthetic title workbook has no worksheet");
    }

    setPatientRow(worksheet, 4, syntheticPatientValues());
    const candidates = await readPatientImportCandidates(
      await createUpload(workbook),
      targetHospitalId,
    );

    expect(candidates[0]?.rowNumber).toBe(4);
    expect(candidates[0]?.fileMetadata?.headerRowNumber).toBe(2);
  });

  it.each([
    ["wrong column order", (worksheet: ExcelJS.Worksheet) => {
      worksheet.getCell("B1").value = "วันเกิด";
      worksheet.getCell("C1").value = "เลขบัตรประชาชน";
    }],
    ["missing canonical column", (worksheet: ExcelJS.Worksheet) => {
      worksheet.getCell("AB1").value = null;
    }],
    ["renamed semantic column", (worksheet: ExcelJS.Worksheet) => {
      worksheet.getCell("B1").value = "เลขประจำตัว";
    }],
    ["extra canonical-area column", (worksheet: ExcelJS.Worksheet) => {
      worksheet.getCell("AC1").value = "คอลัมน์ที่ไม่รองรับ";
    }],
  ])("rejects %s", async (_caseName, mutate) => {
    const workbook = await createPatientImportTemplateWorkbook();
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("The synthetic canonical workbook has no worksheet");
    }

    mutate(worksheet);
    const upload = await createUpload(workbook);

    await expect(readPatientImportCandidates(upload, targetHospitalId)).rejects.toSatisfy(
      (error: unknown) => {
        assertValidationError(error, PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE);
        return true;
      },
    );
  });

  it("accepts only the confirmed classification values under the canonical position", async () => {
    const workbook = await createPatientImportTemplateWorkbook();
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("The synthetic canonical workbook has no worksheet");
    }

    setPatientRow(worksheet, 3, {
      ...syntheticPatientValues(),
      diabetesClassification: "เบาหวาน type 2",
    });
    const [candidate] = await readPatientImportCandidates(
      await createUpload(workbook),
      targetHospitalId,
    );

    expect(candidate?.canonicalRow.clinicalCandidates.diabetesClassification).toBeNull();
    expect(candidate?.canonicalRow.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CLASSIFICATION_DATA_INVALID" }),
      ]),
    );
  });

  it("rejects genuinely independent duplicate Patient header rows", async () => {
    const workbook = createHeaderRowsWorkbook({ duplicate: true, unmerged: true });
    const upload = await createUpload(workbook);

    await expect(readPatientImportCandidates(upload, targetHospitalId)).rejects.toSatisfy(
      (error: unknown) => {
        assertValidationError(error, "พบหัวตารางผู้ป่วยมากกว่าหนึ่งแถวในแผ่นงานเดียวกัน");
        return true;
      },
    );
  });

  it("selects a populated canonical sheet after a blank template-only sheet", async () => {
    const workbook = await createPatientImportTemplateWorkbook();
    const worksheet = workbook.addWorksheet("ข้อมูลผู้ป่วย");

    for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
      worksheet.getCell(`${column.column}1`).value = column.header;
      worksheet.getCell(`${column.column}2`).value =
        PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS[column.column] ?? null;
    }
    setPatientRow(worksheet, 3, syntheticPatientValues());

    const candidates = await readPatientImportCandidates(
      await createUpload(workbook),
      targetHospitalId,
    );

    expect(candidates[0]?.canonicalRow.provenance.sourceSheetName).toBe("ข้อมูลผู้ป่วย");
  });

  it("rejects multiple populated canonical Patient sheets", async () => {
    const workbook = await createPatientImportTemplateWorkbook();
    const firstSheet = workbook.worksheets[0];
    const secondSheet = workbook.addWorksheet("ข้อมูลผู้ป่วย");

    if (!firstSheet) {
      throw new Error("The synthetic canonical workbook has no worksheet");
    }

    setPatientRow(firstSheet, 3, syntheticPatientValues());
    for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
      secondSheet.getCell(`${column.column}1`).value = column.header;
      secondSheet.getCell(`${column.column}2`).value =
        PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS[column.column] ?? null;
    }
    setPatientRow(secondSheet, 3, {
      ...syntheticPatientValues(),
      nationalId: "1000000000017",
    });

    await expect(
      readPatientImportCandidates(await createUpload(workbook), targetHospitalId),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "พบแผ่นงานผู้ป่วยที่มีข้อมูลมากกว่าหนึ่งแผ่น กรุณาแยกไฟล์ก่อนนำเข้า",
    });
  });

  it("keeps the existing row, file-size, and column limits", async () => {
    const tooManyRowsWorkbook = await createPatientImportTemplateWorkbook();
    const tooManyRowsSheet = tooManyRowsWorkbook.worksheets[0];

    if (!tooManyRowsSheet) {
      throw new Error("The synthetic canonical workbook has no worksheet");
    }

    for (let rowNumber = 3; rowNumber <= MAX_PATIENT_IMPORT_ROWS + 3; rowNumber += 1) {
      tooManyRowsSheet.getCell(`D${rowNumber}`).value = "ผู้ป่วยสังเคราะห์";
    }

    await expect(
      readPatientImportCandidates(await createUpload(tooManyRowsWorkbook), targetHospitalId),
    ).rejects.toThrow(`ไฟล์ Excel รองรับผู้ป่วยไม่เกิน ${MAX_PATIENT_IMPORT_ROWS} แถว`);

    const tooLargeUpload: PatientImportUpload = {
      name: "too-large.xlsx",
      size: MAX_PATIENT_IMPORT_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    await expect(readPatientImportCandidates(tooLargeUpload, targetHospitalId)).rejects.toThrow(
      "ไฟล์ Excel ต้องมีขนาดไม่เกิน 5 MB",
    );

    const tooManyColumnsWorkbook = new ExcelJS.Workbook();
    const tooManyColumnsSheet = tooManyColumnsWorkbook.addWorksheet("ข้อมูล");
    tooManyColumnsSheet.addRow(
      Array.from({ length: MAX_PATIENT_IMPORT_COLUMNS + 1 }, (_, index) => `คอลัมน์${index + 1}`),
    );
    await expect(
      readPatientImportCandidates(await createUpload(tooManyColumnsWorkbook), targetHospitalId),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
