import ExcelJS from "exceljs";
import type { CellValue } from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/shared/errors/application-error";

import {
  MAX_PATIENT_IMPORT_BYTES,
  MAX_PATIENT_IMPORT_ROWS,
  readPatientImportCandidates,
  readPatientImportFile,
  type PatientImportUpload,
} from "./excel-patient-import-adapter";
import { PATIENT_IMPORT_FIELD_KEYS, type PatientImportFieldKey } from "../import/patient-import-contract";
import {
  createPatientImportFailedRowsWorkbook,
  createPatientImportTemplateWorkbook,
} from "../import/patient-import-template";
import {
  PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER,
  PATIENT_IMPORT_TEMPLATE_COLUMNS,
  PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_MERGES,
  PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE,
  PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS,
  PATIENT_IMPORT_TEMPLATE_SHEET_NAME,
} from "../import/patient-import-template-contract";
import {
  findPatientImportDataWorksheet,
  type PatientImportTemplateTarget,
} from "../import/patient-import-template-validation";

const hospitalA: PatientImportTemplateTarget = {
  hospitalId: "11111111-1111-4111-8111-111111111111",
  hospitalCode: "SYN-A",
  hospitalName: "โรงพยาบาลสังเคราะห์เอ",
};
const hospitalB: PatientImportTemplateTarget = {
  hospitalId: "22222222-2222-4222-8222-222222222222",
  hospitalCode: "SYN-B",
  hospitalName: "โรงพยาบาลสังเคราะห์บี",
};

type SyntheticPatientValues = Partial<Record<PatientImportFieldKey, CellValue>>;

async function createUpload(
  workbook: ExcelJS.Workbook,
  name = "synthetic-patients.xlsx",
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
    historyDiabetes: "มี",
    historyHypertension: "ไม่มี",
    otherConditions: "โรคหอบหืด",
    familyHypertension: "ไม่ทราบ",
    familyDiabetes: "มี",
    familyHeartDisease: null,
    familyStroke: "ไม่มี",
  };
}

async function createTemplateWorkbook(
  hospital: PatientImportTemplateTarget = hospitalA,
): Promise<{ workbook: ExcelJS.Workbook; worksheet: ExcelJS.Worksheet }> {
  const workbook = await createPatientImportTemplateWorkbook(hospital);
  const worksheet = findPatientImportDataWorksheet(workbook);

  if (!worksheet) {
    throw new Error("The synthetic template workbook has no patient worksheet");
  }

  return { workbook, worksheet };
}

async function createCanonicalUpload(
  values: SyntheticPatientValues | null = syntheticPatientValues(),
  hospital: PatientImportTemplateTarget = hospitalA,
): Promise<PatientImportUpload> {
  const { workbook, worksheet } = await createTemplateWorkbook(hospital);

  if (values) {
    setPatientRow(worksheet, 3, values);
  }

  return createUpload(workbook);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

async function expectTemplateMismatch(upload: PatientImportUpload): Promise<void> {
  await expect(readPatientImportCandidates(upload, hospitalA)).rejects.toSatisfy(
    (error: unknown) => {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({
        code: "VALIDATION",
        message: PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE,
      });
      return true;
    },
  );
}

function setMetadata(workbook: ExcelJS.Workbook, cell: "B1" | "B2", value: CellValue): void {
  const metadata = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME);

  if (!metadata) {
    throw new Error("The synthetic template has no metadata sheet");
  }

  metadata.getCell(cell).value = value;
}

describe("Strict hospital-bound patient import parser (template v3)", () => {
  it("parses the blank template and its first synthetic patient row", async () => {
    await expect(readPatientImportCandidates(await createCanonicalUpload(null), hospitalA)).resolves.toEqual(
      [],
    );

    const candidates = await readPatientImportCandidates(await createCanonicalUpload(), hospitalA);
    const candidate = candidates[0];

    expect(candidate?.input).toMatchObject({
      givenName: "ตัวอย่าง",
      familyName: "ผู้ป่วย",
      hospitalNumber: "HN-SYN-001",
      targetHospitalId: hospitalA.hospitalId,
    });
    expect(candidate?.canonicalRow.provenance.sourceRowNumber).toBe(3);
    expect(candidate?.canonicalRow.identity.nationalId).toBe("1000000000009");
    expect(candidate?.canonicalRow.contact.phoneNumber).toBe("0812345678");
    expect(candidate?.canonicalRow.contact.emergencyContactPhone).toBe("0823456789");
    expect(candidate?.canonicalRow.clinicalCandidates).toEqual({
      weight: 72.5,
      height: 165,
      waistCircumference: 88,
      diabetesClassification: "RISK",
      bloodSugarDtx: 126,
      hba1c: 6.5,
    });
    expect(candidate?.canonicalRow.healthHistoryCandidates).toEqual({
      diabetes: "YES",
      hypertension: "NO",
      otherConditions: "โรคหอบหืด",
      familyHypertension: "UNKNOWN",
      familyDiabetes: "YES",
      familyHeartDisease: "UNKNOWN",
      familyStroke: "NO",
    });
    expect(candidate?.fileMetadata).toMatchObject({
      worksheetName: "รายชื่อผู้ป่วย",
      headerRowNumber: 1,
      templateVersion: "patient-import-template-v3",
      hospitalCode: hospitalA.hospitalCode,
    });
  }, 10000);

  it("accepts checksum-invalid synthetic National IDs from Excel in production-mode UAT", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_DEPLOYMENT_STAGE", "uat");
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");

    const [candidate] = await readPatientImportCandidates(
      await createCanonicalUpload({
        ...syntheticPatientValues(),
        nationalId: "1111111111111",
      }),
      hospitalA,
    );

    expect(candidate?.input?.identity.value).toBe("1111111111111");
    expect(candidate?.validationMessage).toBeNull();
  }, 10000);

  it("carries no hospital or OSM field in the canonical row", async () => {
    const [candidate] = await readPatientImportCandidates(await createCanonicalUpload(), hospitalA);

    expect(candidate?.canonicalRow.organizationCandidates).toEqual({ hospitalNumber: "HN-SYN-001" });
    expect(candidate?.canonicalRow).not.toHaveProperty("caregiverCandidates");
    expect(Object.keys(candidate?.canonicalRow.fieldAssessments ?? {})).toEqual([
      ...PATIENT_IMPORT_FIELD_KEYS,
    ]);
    expect(PATIENT_IMPORT_FIELD_KEYS).toHaveLength(PATIENT_IMPORT_TEMPLATE_COLUMNS.length);
  });

  it("reads all 500 patient rows, preserves the final coordinate and returns the source cells", async () => {
    const { workbook, worksheet } = await createTemplateWorkbook();

    for (let index = 0; index < 500; index += 1) {
      setPatientRow(worksheet, index + 3, {
        ...syntheticPatientValues(),
        sourceSequenceNumber: index + 1,
      });
    }

    const { candidates, sourceRows } = await readPatientImportFile(
      await createUpload(workbook, "synthetic-500-patients.xlsx"),
      hospitalA,
    );
    const lastCandidate = candidates[candidates.length - 1];

    expect(candidates).toHaveLength(500);
    expect(candidates[0]?.rowNumber).toBe(3);
    expect(lastCandidate?.rowNumber).toBe(502);
    expect(sourceRows.size).toBe(500);
    expect(sourceRows.get(3)).toHaveLength(PATIENT_IMPORT_TEMPLATE_COLUMNS.length);
    expect(sourceRows.get(3)?.[1]).toBe("1000000000009");
  }, 20000);

  it("rejects a 501st patient row", async () => {
    const { workbook, worksheet } = await createTemplateWorkbook();

    for (let rowNumber = 3; rowNumber <= MAX_PATIENT_IMPORT_ROWS + 3; rowNumber += 1) {
      worksheet.getCell(`D${rowNumber}`).value = "ผู้ป่วยสังเคราะห์";
    }

    await expect(
      readPatientImportCandidates(await createUpload(workbook), hospitalA),
    ).rejects.toThrow(`ไฟล์ Excel รองรับผู้ป่วยไม่เกิน ${MAX_PATIENT_IMPORT_ROWS} แถว`);
  }, 20000);

  describe("hospital binding", () => {
    it("accepts the file for its own hospital", async () => {
      await expect(
        readPatientImportCandidates(await createCanonicalUpload(undefined, hospitalB), hospitalB),
      ).resolves.toHaveLength(1);
    });

    it("rejects hospital B's file when hospital A is selected, naming only A", async () => {
      const upload = await createCanonicalUpload(undefined, hospitalB);
      let rejection: unknown;

      await readPatientImportCandidates(upload, hospitalA).catch((error: unknown) => {
        rejection = error;
      });

      expect(rejection).toBeInstanceOf(ValidationError);
      const message = (rejection as ValidationError).message;
      expect(message).toContain(hospitalA.hospitalName);
      expect(message).not.toContain(hospitalA.hospitalCode);
      expect(message).not.toContain(hospitalB.hospitalName);
      expect(message).not.toContain(hospitalB.hospitalCode);
      expect(message).not.toBe(PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE);
    });

    it("rejects a file without the metadata sheet", async () => {
      const { workbook } = await createTemplateWorkbook();
      const metadata = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME);

      if (!metadata) {
        throw new Error("The synthetic template has no metadata sheet");
      }

      workbook.removeWorksheet(metadata.id);
      await expectTemplateMismatch(await createUpload(workbook));
    });

    it.each(["patient-import-template-v1", "patient-import-template-v2"])(
      "rejects any template version other than v3 (%s)",
      async (staleVersion) => {
        const { workbook } = await createTemplateWorkbook();
        setMetadata(workbook, "B1", staleVersion);
        await expectTemplateMismatch(await createUpload(workbook));
      },
    );

    it("rejects metadata without a hospital code", async () => {
      const { workbook } = await createTemplateWorkbook();
      setMetadata(workbook, "B2", null);
      await expectTemplateMismatch(await createUpload(workbook));
    });

    it("rejects a v1-shaped file: hospital and OSM columns, no metadata", async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(PATIENT_IMPORT_TEMPLATE_SHEET_NAME);
      const v1Headers: string[] = PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ header }) => header);

      v1Headers.splice(14, 0, "โรงพยาบาล");
      v1Headers.push("ชื่อผู้ดูแล (อสม.)");
      worksheet.addRow(v1Headers);
      worksheet.addRow([]);
      worksheet.addRow(
        v1Headers.map((header, index) => (index === 1 ? "1000000000009" : header)),
      );

      await expectTemplateMismatch(await createUpload(workbook));
    });

    it("never treats the metadata sheet as the patient sheet", async () => {
      const { workbook } = await createTemplateWorkbook();
      const patientSheet = findPatientImportDataWorksheet(workbook);
      const metadata = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME);

      if (!patientSheet || !metadata) {
        throw new Error("The synthetic template is incomplete");
      }

      expect(findPatientImportDataWorksheet(workbook)?.name).toBe(PATIENT_IMPORT_TEMPLATE_SHEET_NAME);
      expect(findPatientImportDataWorksheet(workbook)?.name).not.toBe(metadata.name);

      // Even if the patient sheet is gone and the metadata sheet imitates a patient header.
      for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
        metadata.getCell(`${column.column}3`).value = column.header;
      }
      workbook.removeWorksheet(patientSheet.id);

      expect(findPatientImportDataWorksheet(workbook)).toBeNull();
      await expectTemplateMismatch(await createUpload(workbook));
    });

    it("ignores other sheets and reads patients only from the template sheet", async () => {
      const { workbook, worksheet } = await createTemplateWorkbook();
      setPatientRow(worksheet, 3, syntheticPatientValues());
      const extra = workbook.addWorksheet("บันทึกอื่น");
      extra.getCell("A1").value = "โน้ตของผู้ใช้";

      const candidates = await readPatientImportCandidates(await createUpload(workbook), hospitalA);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.canonicalRow.provenance.sourceSheetName).toBe(
        PATIENT_IMPORT_TEMPLATE_SHEET_NAME,
      );
    });
  });

  describe("header contract", () => {
    it("accepts a semantically identical unmerged header", async () => {
      const { workbook, worksheet } = await createTemplateWorkbook();

      for (const merge of PATIENT_IMPORT_TEMPLATE_MERGES) {
        worksheet.unMergeCells(merge);
      }
      setPatientRow(worksheet, 3, syntheticPatientValues());

      const candidates = await readPatientImportCandidates(await createUpload(workbook), hospitalA);

      expect(candidates[0]?.canonicalRow.contact.phoneNumber).toBe("0812345678");
    });

    it.each([
      ["wrong column order", (worksheet: ExcelJS.Worksheet) => {
        worksheet.getCell("B1").value = "วันเกิด";
        worksheet.getCell("C1").value = "เลขบัตรประชาชน";
      }],
      ["missing column", (worksheet: ExcelJS.Worksheet) => {
        worksheet.getCell("Z1").value = null;
      }],
      ["renamed column", (worksheet: ExcelJS.Worksheet) => {
        worksheet.getCell("B1").value = "เลขประจำตัว";
      }],
      ["changed secondary caption", (worksheet: ExcelJS.Worksheet) => {
        worksheet.getCell("L2").value = "ข้อความอื่น";
      }],
      ["extra column with an unknown header", (worksheet: ExcelJS.Worksheet) => {
        worksheet.getCell("AH1").value = "คอลัมน์ที่ไม่รองรับ";
      }],
      ["extra column behind the reason column", (worksheet: ExcelJS.Worksheet) => {
        worksheet.getCell("AH1").value = PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER;
        worksheet.getCell("AI1").value = "คอลัมน์ที่ไม่รองรับ";
      }],
      ["stray value in a later column", (worksheet: ExcelJS.Worksheet) => {
        worksheet.getCell("AK7").value = "โน้ต";
      }],
      ["the v2 column layout (no medical/family history columns)", (worksheet: ExcelJS.Worksheet) => {
        worksheet.spliceColumns(27, 7);
      }],
      ["a changed health history caption", (worksheet: ExcelJS.Worksheet) => {
        worksheet.getCell("AD2").value = "ใช่ / ไม่ใช่";
      }],
      ["the v2 reason column position", (worksheet: ExcelJS.Worksheet) => {
        worksheet.getCell("AA1").value = PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER;
      }],
      ["header shifted down by a title row", (worksheet: ExcelJS.Worksheet) => {
        worksheet.spliceRows(1, 0, ["DEMI Patient roster"]);
      }],
      ["the legacy hospital column re-inserted", (worksheet: ExcelJS.Worksheet) => {
        worksheet.spliceColumns(15, 0, ["โรงพยาบาล", null]);
      }],
    ])("rejects %s", async (_caseName, mutate) => {
      const { workbook, worksheet } = await createTemplateWorkbook();

      mutate(worksheet);
      await expectTemplateMismatch(await createUpload(workbook));
    });

    it("accepts exactly one trailing reason column and ignores it", async () => {
      const workbook = await createPatientImportFailedRowsWorkbook(hospitalA, [
        {
          values: PATIENT_IMPORT_TEMPLATE_COLUMNS.map(
            ({ field }) => syntheticPatientValues()[field] ?? null,
          ),
          reason: "เลขบัตรประชาชนไม่ถูกต้อง",
        },
      ]);

      const candidates = await readPatientImportCandidates(await createUpload(workbook), hospitalA);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.canonicalRow.identity.nationalId).toBe("1000000000009");
      expect(JSON.stringify(candidates[0]?.canonicalRow)).not.toContain("เลขบัตรประชาชนไม่ถูกต้อง");
    });

    it("rejects a failed-rows file for another hospital", async () => {
      const workbook = await createPatientImportFailedRowsWorkbook(hospitalB, [
        {
          values: PATIENT_IMPORT_TEMPLATE_COLUMNS.map(
            ({ field }) => syntheticPatientValues()[field] ?? null,
          ),
          reason: "ข้อมูลไม่ถูกต้อง",
        },
      ]);

      await expect(
        readPatientImportCandidates(await createUpload(workbook), hospitalA),
      ).rejects.toThrow(hospitalA.hospitalName);
    });
  });

  describe("cell values", () => {
    async function readSingleRow(values: SyntheticPatientValues) {
      const [candidate] = await readPatientImportCandidates(
        await createCanonicalUpload(values),
        hospitalA,
      );

      if (!candidate) {
        throw new Error("The synthetic row was not parsed");
      }

      return candidate;
    }

    it("maps only the confirmed Thai classification values", async () => {
      const risk = await readSingleRow({ ...syntheticPatientValues(), diabetesClassification: "  กลุ่มเสี่ยง  " });
      const diabetes = await readSingleRow({ ...syntheticPatientValues(), diabetesClassification: "เบาหวาน" });
      const other = await readSingleRow({
        ...syntheticPatientValues(),
        diabetesClassification: "เบาหวาน type 2",
      });

      expect(risk.canonicalRow.clinicalCandidates.diabetesClassification).toBe("RISK");
      expect(diabetes.canonicalRow.clinicalCandidates.diabetesClassification).toBe("DIABETES");
      expect(other.canonicalRow.clinicalCandidates.diabetesClassification).toBeNull();
      expect(other.canonicalRow.fieldAssessments.diabetesClassification.status).toBe("INVALID");
      expect(other.canonicalRow.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "CLASSIFICATION_DATA_INVALID" })]),
      );
    });

    it("keeps blank and dash baseline cells as no assertion instead of zero", async () => {
      const candidate = await readSingleRow({
        ...syntheticPatientValues(),
        weight: "-",
        height: "",
        waistCircumference: null,
        bloodSugarDtx: " ",
        hba1c: "-",
      });

      expect(candidate.canonicalRow.clinicalCandidates).toMatchObject({
        weight: null,
        height: null,
        waistCircumference: null,
        bloodSugarDtx: null,
        hba1c: null,
      });
      expect(candidate.canonicalRow.diagnostics).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "INVALID_VALUE" })]),
      );
    });

    it("reads height as centimeters and flags a malformed baseline value", async () => {
      const candidate = await readSingleRow({
        ...syntheticPatientValues(),
        weight: "not-a-number",
        height: "170",
      });

      expect(candidate.canonicalRow.clinicalCandidates.height).toBe(170);
      expect(candidate.canonicalRow.clinicalCandidates).not.toHaveProperty("heightUnit");
      expect(candidate.canonicalRow.fieldAssessments.weight.status).toBe("INVALID");
      expect(candidate.canonicalRow.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "INVALID_VALUE", field: "weight" })]),
      );
    });

    it("keeps National ID lossiness and phone leading-zero loss visible", async () => {
      const lossyId = await readSingleRow({ ...syntheticPatientValues(), nationalId: "1.0008E+12" });
      const lostZero = await readSingleRow({ ...syntheticPatientValues(), phoneNumber: 812345679 });
      const numericId = await readSingleRow({ ...syntheticPatientValues(), nationalId: 1000000000033 });

      expect(lossyId.input).toBeNull();
      expect(lossyId.canonicalRow.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "LOSSY_EXCEL_VALUE" })]),
      );
      expect(lostZero.canonicalRow.contact.phoneNumber).toBe("812345679");
      expect(lostZero.canonicalRow.fieldAssessments.phoneNumber.status).toBe("AMBIGUOUS");
      expect(lostZero.input).not.toBeNull();
      expect(numericId.input).not.toBeNull();
    });

    it.each([
      ["dateOfBirth", "31/02/2523"],
      ["phoneNumber", "โทรศัพท์"],
      ["emergencyContactPhone", { formula: "1+1", result: 2 }],
      ["emergencyContactRelationship", { error: "#VALUE!" }],
      ["postalCode", "1234"],
      ["postalCode", 1234],
      ["hospitalNumber", 71],
      ["gender", "ก".repeat(65)],
      ["houseNumber", "ก".repeat(201)],
    ] satisfies readonly (readonly [PatientImportFieldKey, CellValue])[])("retains diagnostics for malformed %s independently of identity eligibility", async (field, value) => {
      const candidate = await readSingleRow({ ...syntheticPatientValues(), [field]: value });
      expect(candidate.input === null).toBe(field === "hospitalNumber");
      expect(candidate.canonicalRow.fieldAssessments[field].diagnostics.length).toBeGreaterThan(0);
    });

    it("normalizes the Thai date text and Excel date cells as date-only values", async () => {
      const text = await readSingleRow({ ...syntheticPatientValues(), dateOfBirth: "4 พฤษภาคม 2568" });
      const dmy = await readSingleRow({ ...syntheticPatientValues(), dateOfBirth: "04/05/2568" });
      const excelDate = await readSingleRow({
        ...syntheticPatientValues(),
        dateOfBirth: new Date(Date.UTC(2010, 0, 2)),
      });

      expect(text.canonicalRow.demographics.dateOfBirth).toBe("2025-05-04");
      expect(dmy.canonicalRow.demographics.dateOfBirth).toBe("2025-05-04");
      expect(excelDate.canonicalRow.demographics.dateOfBirth).toBe("2010-01-02");
    });

    it("flags a missing name instead of accepting the row", async () => {
      const candidate = await readSingleRow({ ...syntheticPatientValues(), givenName: null });

      expect(candidate.input).toBeNull();
      expect(candidate.validationMessage).toBe("กรุณาระบุชื่อ");
    });
  });

  describe("limits", () => {
    it("rejects a non-xlsx name, an empty file and an oversized file", async () => {
      const upload = await createCanonicalUpload();

      await expect(
        readPatientImportCandidates({ ...upload, name: "patients.csv" }, hospitalA),
      ).rejects.toThrow("รองรับเฉพาะไฟล์ Excel .xlsx");
      await expect(
        readPatientImportCandidates({ ...upload, size: 0 }, hospitalA),
      ).rejects.toThrow("ไฟล์ Excel ต้องมีขนาดไม่เกิน 5 MB");
      await expect(
        readPatientImportCandidates(
          { name: "too-large.xlsx", size: MAX_PATIENT_IMPORT_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) },
          hospitalA,
        ),
      ).rejects.toThrow("ไฟล์ Excel ต้องมีขนาดไม่เกิน 5 MB");
    });

    it("rejects bytes that are not a workbook", async () => {
      await expect(
        readPatientImportCandidates(
          {
            name: "not-a-workbook.xlsx",
            size: 16,
            arrayBuffer: async () => new TextEncoder().encode("not a zip archive").buffer as ArrayBuffer,
          },
          hospitalA,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rejects a hospital id that is not a UUID", async () => {
      await expect(
        readPatientImportCandidates(await createCanonicalUpload(), { ...hospitalA, hospitalId: "not-a-uuid" }),
      ).rejects.toThrow("โรงพยาบาลที่เลือกไม่ถูกต้อง");
    });
  });
});

describe("populated-row detection (no silent skipping)", () => {
  it.each<[string, SyntheticPatientValues]>([
    ["HN only", { hospitalNumber: "HN-ONLY" }],
    ["clinical data only", { weight: 70, hba1c: 6.1 }],
    ["date of birth only", { dateOfBirth: "04/05/2568" }],
    ["contact data only", { phoneNumber: "0812345678" }],
    ["address data only", { province: "จังหวัดสังเคราะห์" }],
    ["name without a national id", { givenName: "ตัวอย่าง", familyName: "ผู้ป่วย" }],
    ["sequence number only", { sourceSequenceNumber: 1 }],
    ["a numeric zero", { weight: 0 }],
  ])("keeps a row with %s as an invalid candidate at its own row number", async (_name, values) => {
    const { workbook, worksheet } = await createTemplateWorkbook();

    setPatientRow(worksheet, 6, values);

    const candidates = await readPatientImportCandidates(await createUpload(workbook), hospitalA);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.rowNumber).toBe(6);
    expect(candidates[0]?.input).toBeNull();
    expect(candidates[0]?.validationMessage).not.toBeNull();
  });

  it("keeps formula and error cells as populated rows", async () => {
    const { workbook, worksheet } = await createTemplateWorkbook();

    worksheet.getCell("F3").value = { formula: "1+1", result: 2 };
    worksheet.getCell("F4").value = { error: "#N/A" };
    worksheet.getCell("F5").value = { richText: [{ text: "   " }] };

    const candidates = await readPatientImportCandidates(await createUpload(workbook), hospitalA);

    expect(candidates.map(({ rowNumber }) => rowNumber)).toEqual([3, 4]);
  });

  it("ignores styled, blank and placeholder-only rows and keeps the original row number after gaps", async () => {
    const { workbook, worksheet } = await createTemplateWorkbook();

    for (let rowNumber = 3; rowNumber <= 9; rowNumber += 1) {
      worksheet.getCell(`D${rowNumber}`).style = { font: { bold: true } };
      worksheet.getCell(`D${rowNumber}`).value = rowNumber === 4 ? "   " : rowNumber === 5 ? "-" : null;
    }

    setPatientRow(worksheet, 10, syntheticPatientValues());

    const candidates = await readPatientImportCandidates(await createUpload(workbook), hospitalA);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.rowNumber).toBe(10);
    expect(candidates[0]?.input).not.toBeNull();
  });

  it("counts invalid populated rows toward the 500-row limit", async () => {
    const { workbook, worksheet } = await createTemplateWorkbook();

    for (let rowNumber = 3; rowNumber < 3 + MAX_PATIENT_IMPORT_ROWS; rowNumber += 1) {
      setPatientRow(worksheet, rowNumber, syntheticPatientValues());
    }

    worksheet.getCell(`F${3 + MAX_PATIENT_IMPORT_ROWS}`).value = "HN-INVALID-501";

    await expect(
      readPatientImportCandidates(await createUpload(workbook), hospitalA),
    ).rejects.toThrow(`ไฟล์ Excel รองรับผู้ป่วยไม่เกิน ${MAX_PATIENT_IMPORT_ROWS} แถว`);
  }, 20000);

  it("does not treat the trailing reason column as patient data", async () => {
    const workbook = await createPatientImportFailedRowsWorkbook(hospitalA, [
      { values: PATIENT_IMPORT_TEMPLATE_COLUMNS.map(() => null), reason: "เหตุผลที่ไม่ใช่ข้อมูลผู้ป่วย" },
    ]);

    await expect(readPatientImportCandidates(await createUpload(workbook), hospitalA)).resolves.toEqual([]);
  });

  it("re-imports a failed-rows workbook once the invalid cell is corrected", async () => {
    const values = PATIENT_IMPORT_TEMPLATE_COLUMNS.map(({ field }) =>
      field === "nationalId" ? "123" : (syntheticPatientValues()[field] ?? null),
    );
    const workbook = await createPatientImportFailedRowsWorkbook(hospitalA, [
      { values, reason: "เลขบัตรประชาชนไม่ถูกต้อง" },
    ]);
    const worksheet = findPatientImportDataWorksheet(workbook);

    if (!worksheet) {
      throw new Error("The failed-rows workbook has no patient worksheet");
    }

    const [invalid] = await readPatientImportCandidates(await createUpload(workbook), hospitalA);

    expect(invalid?.input).toBeNull();

    const nationalIdColumn = PATIENT_IMPORT_TEMPLATE_COLUMNS.find(({ field }) => field === "nationalId");
    worksheet.getCell(`${nationalIdColumn?.column}3`).value = "1000000000009";

    const [corrected] = await readPatientImportCandidates(await createUpload(workbook), hospitalA);

    expect(corrected?.input).not.toBeNull();
    expect(corrected?.rowNumber).toBe(3);
  });
});

describe("secondary header contract", () => {
  it("captions only the classification and the medical/family history columns", () => {
    expect(Object.keys(PATIENT_IMPORT_TEMPLATE_SECONDARY_HEADERS)).toEqual([
      "L", "AA", "AB", "AC", "AD", "AE", "AF", "AG",
    ]);
    expect(PATIENT_IMPORT_TEMPLATE_MERGES).not.toContain("L1:L2");
    expect(PATIENT_IMPORT_TEMPLATE_MERGES).not.toContain("AA1:AA2");
    expect(PATIENT_IMPORT_TEMPLATE_MERGES).toHaveLength(PATIENT_IMPORT_TEMPLATE_COLUMNS.length - 8);
  });
});

describe("medical and family history answers", () => {
  async function readHistory(values: SyntheticPatientValues) {
    const [candidate] = await readPatientImportCandidates(
      await createCanonicalUpload({ ...syntheticPatientValues(), ...values }),
      hospitalA,
    );
    return candidate?.canonicalRow;
  }

  it("maps blank and '-' to UNKNOWN, never NO, and keeps a blank other-conditions cell null", async () => {
    const row = await readHistory({
      historyDiabetes: null,
      historyHypertension: "-",
      otherConditions: " ",
      familyHypertension: null,
      familyDiabetes: null,
      familyHeartDisease: null,
      familyStroke: null,
    });

    expect(row?.healthHistoryCandidates).toEqual({
      diabetes: "UNKNOWN",
      hypertension: "UNKNOWN",
      otherConditions: null,
      familyHypertension: "UNKNOWN",
      familyDiabetes: "UNKNOWN",
      familyHeartDisease: "UNKNOWN",
      familyStroke: "UNKNOWN",
    });
    expect(row?.diagnostics).toEqual([]);
  });

  it("accepts the exact Thai answers with surrounding whitespace", async () => {
    const row = await readHistory({ historyDiabetes: "  มี ", familyStroke: "ไม่ทราบ " });

    expect(row?.healthHistoryCandidates).toMatchObject({ diabetes: "YES", familyStroke: "UNKNOWN" });
  });

  it.each([["ใช่"], ["YES"], ["N"], [1], [true]] as const)(
    "rejects the unsupported answer %s with a column diagnostic",
    async (value) => {
      const row = await readHistory({ familyHeartDisease: value });

      expect(row?.fieldAssessments.familyHeartDisease).toMatchObject({
        status: "INVALID",
        diagnostics: expect.arrayContaining(["HEALTH_HISTORY_DATA_INVALID"]),
      });
      expect(row?.diagnostics).toContainEqual(expect.objectContaining({
        code: "HEALTH_HISTORY_DATA_INVALID",
        field: "familyHeartDisease",
        sourceHeader: "ญาติสายตรง: โรคหัวใจ",
      }));
    },
  );
});
