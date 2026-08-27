import ExcelJS from "exceljs";
import type { CellValue } from "exceljs";
import { describe, expect, it } from "vitest";

import { ValidationError } from "@/shared/errors/application-error";

import {
  MAX_PATIENT_IMPORT_COLUMNS,
  MAX_PATIENT_IMPORT_ROWS,
  readPatientImportCandidates,
  type PatientImportUpload,
} from "./excel-patient-import-adapter";

const targetHospitalId = "11111111-1111-4111-8111-111111111111";

type SyntheticSheet = {
  name: string;
  rows: readonly (readonly CellValue[])[];
};

async function createUpload(
  sheets: readonly SyntheticSheet[],
  name = "synthetic-patients.xlsx",
): Promise<PatientImportUpload> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);

    for (const row of sheet.rows) {
      worksheet.addRow([...row]);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function coreHeaders(...extra: string[]): string[] {
  return ["Thai National ID", "First name", "Last name", "HN", ...extra];
}

function coreRow(nationalId = "1000000000009"): string[] {
  return [nationalId, "ตัวอย่าง", "ผู้ป่วย", "HN-SYN-001"];
}

describe("Excel patient import adapter V2 compatibility foundation", () => {
  it("parses the wide operational roster shape without expanding provisioning input", async () => {
    const upload = await createUpload([
      {
        name: "Roster",
        rows: [
          [
            "National ID",
            "ชื่อผู้ป่วย",
            "นามสกุล",
            "HN",
            "วันเกิด(พ.ศ.)",
            "เพศ",
            "เบอร์โทรศัพท์",
            "น้ำหนัก (kg)",
            "ส่วนสูง(cm)",
            "รอบเอว (ซม.)",
            "ประเภทเบาหวาน",
            "ค่าน้ำตาล",
            "HbA1c",
            "โรงพยาบาล",
            "รพ.สต.",
            "บ้านเลขที่",
            "หมู่ที่",
            "หมู่บ้าน",
            "ซอย",
            "ถนน",
            "จังหวัด",
            "อำเภอ",
            "ตำบล",
            "รหัสไปรษณีย์",
            "ชื่อผู้ติดต่อ",
            "เบอร์ผู้ติดต่อ",
            "ความสัมพันธ์",
            "โค้ช",
            "PID",
            "BP",
            "P",
            "BMI",
            "ค่า DTX",
            "ปัญหา/ปัจจัยเสี่ยง",
          ],
          [
            "1-0000-0000-0009",
            "ตัวอย่าง",
            "ผู้ป่วย",
            "HN-SYN-001",
            "04/05/2568",
            "ตัวอย่างเพศ",
            "081-234-5678",
            72.5,
            165,
            88,
            "กลุ่มเสี่ยง",
            126,
            6.5,
            "โรงพยาบาลตัวอย่าง",
            "รพ.สต.ตัวอย่าง",
            "99/1",
            "7",
            "หมู่บ้านตัวอย่าง",
            "ซอยตัวอย่าง",
            "ถนนตัวอย่าง",
            "จังหวัดตัวอย่าง",
            "อำเภอตัวอย่าง",
            "ตำบลตัวอย่าง",
            "00000",
            "ผู้ติดต่อสังเคราะห์",
            "082-345-6789",
            "ญาติ",
            "โค้ชตัวอย่าง",
            "PID-SYN-001",
            "120/80",
            78,
            24.5,
            126,
            "ปัจจัยเสี่ยงตัวอย่าง",
          ],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.input).toMatchObject({
      givenName: "ตัวอย่าง",
      familyName: "ผู้ป่วย",
      hospitalNumber: "HN-SYN-001",
      targetHospitalId,
    });
    expect(candidate.canonicalRow.identity.nationalId).toBe("1000000000009");
    expect(candidate.canonicalRow.demographics.dateOfBirth).toBe("2025-05-04");
    expect(candidate.canonicalRow.contact.phoneNumber).toBe("0812345678");
    expect(candidate.canonicalRow.clinicalCandidates).toMatchObject({
      weight: 72.5,
      height: 165,
      heightUnit: "cm",
      waistCircumference: 88,
      diabetesClassification: "RISK",
      bloodSugar: 126,
      bloodSugarDtx: null,
      hba1c: 6.5,
      bmi: 24.5,
    });
    expect(candidate.canonicalRow.caregiverCandidates.osmCaregiverName).toBe("โค้ชตัวอย่าง");
    expect(candidate.fileMetadata?.layout).toBe("EXTENDED_ROSTER");
    expect(candidate.fileMetadata?.requirementGatedFields).toEqual(
      expect.arrayContaining(["dateOfBirth"]),
    );
    expect(candidate.fileMetadata?.requirementGatedFields).not.toContain("osmCaregiverName");
    expect(candidate.fileMetadata?.requirementGatedFields).not.toContain(
      "diabetesClassification",
    );
    expect(candidate.fileMetadata?.requirementGatedFields).not.toEqual(
      expect.arrayContaining(["weight", "height", "waistCircumference", "hba1c"]),
    );
    expect(candidate.canonicalRow.fieldAssessments.weight.status).toBe("PARSED_FOR_INITIAL_BASELINE");
    expect(candidate.canonicalRow.fieldAssessments.diabetesClassification.status).toBe(
      "SUPPORTED_FOR_PATIENT_CLASSIFICATION",
    );
    expect(candidate.canonicalRow.fieldAssessments.osmCaregiverName.status).toBe(
      "SUPPORTED_FOR_OSM_ASSIGNMENT",
    );
    expect(candidate.input).not.toHaveProperty("dateOfBirth");
    expect(candidate.input).not.toHaveProperty("clinicalCandidates");
  });

  it("maps only the confirmed Thai classification values after safe normalization", async () => {
    const upload = await createUpload([
      {
        name: "Classification",
        rows: [
          coreHeaders("กลุ่มเสี่ยง หรือ เบาหวาน"),
          [...coreRow("1000000000009"), "  กลุ่มเสี่ยง  "],
          [...coreRow("1000000000017"), "เบาหวาน"],
          [...coreRow("1000000000025"), "เบาหวาน type 2"],
        ],
      },
    ]);

    const candidates = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidates.map((candidate) => candidate.canonicalRow.clinicalCandidates.diabetesClassification)).toEqual([
      "RISK",
      "DIABETES",
      null,
    ]);
    expect(candidates[0].canonicalRow.fieldAssessments.diabetesClassification.status).toBe(
      "SUPPORTED_FOR_PATIENT_CLASSIFICATION",
    );
    expect(candidates[1].canonicalRow.fieldAssessments.diabetesClassification.status).toBe(
      "SUPPORTED_FOR_PATIENT_CLASSIFICATION",
    );
    expect(candidates[2].canonicalRow.fieldAssessments.diabetesClassification.status).toBe(
      "INVALID",
    );
    expect(candidates[2].canonicalRow.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CLASSIFICATION_DATA_INVALID" }),
      ]),
    );
  });

  it("does not treat the misleading diabetes type alias as a classification header", async () => {
    const upload = await createUpload([
      {
        name: "Legacy classification wording",
        rows: [
          coreHeaders("diabetes type"),
          [...coreRow(), "เบาหวาน"],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.canonicalRow.clinicalCandidates.diabetesClassification).toBeNull();
    expect(candidate.canonicalRow.fieldAssessments.diabetesClassification.status).toBe(
      "NOT_PRESENT",
    );
    expect(candidate.fileMetadata?.unknownHeaders).toContain("diabetes type");
  });

  it("maps the confirmed operational baseline fields with explicit units", async () => {
    const upload = await createUpload([
      {
        name: "Confirmed baseline",
        rows: [
          coreHeaders("น้ำหนัก", "ส่วนสูง", "รอบเอว", "ค่าน้ำตาลในเลือด", "ค่า HbA1c ล่าสุด (ถ้ามี)"),
          [...coreRow(), "72.5", "170", 85, "126", "6.5"],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.canonicalRow.clinicalCandidates).toMatchObject({
      weight: 72.5,
      height: 170,
      heightUnit: "cm",
      waistCircumference: 85,
      bloodSugar: null,
      bloodSugarDtx: 126,
      hba1c: 6.5,
    });
    expect(candidate.canonicalRow.fieldAssessments.weight.status).toBe(
      "PARSED_FOR_INITIAL_BASELINE",
    );
    expect(candidate.canonicalRow.fieldAssessments.height.status).toBe(
      "PARSED_FOR_INITIAL_BASELINE",
    );
    expect(candidate.canonicalRow.fieldAssessments.bloodSugarDtx.status).toBe(
      "PARSED_FOR_INITIAL_BASELINE",
    );
    expect(candidate.fileMetadata?.requirementGatedFields).not.toEqual(
      expect.arrayContaining(["weight", "height", "waistCircumference", "hba1c", "bloodSugarDtx"]),
    );
  });

  it("keeps blank and dash baseline cells as no assertion instead of zero", async () => {
    const upload = await createUpload([
      {
        name: "Blank baseline",
        rows: [
          coreHeaders("น้ำหนัก", "ส่วนสูง", "รอบเอว", "ค่าน้ำตาลในเลือด", "HbA1c"),
          [...coreRow(), "-", "", null, " ", "-"],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

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

  it("rejects malformed or unsupported baseline units without guessing", async () => {
    const upload = await createUpload([
      {
        name: "Invalid baseline",
        rows: [
          coreHeaders("น้ำหนัก", "ส่วนสูง (เมตร)", "ค่าน้ำตาลในเลือด"),
          [...coreRow(), "not-a-number", 1.7, "not-a-number"],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.canonicalRow.clinicalCandidates).toMatchObject({
      weight: null,
      height: 1.7,
      heightUnit: "m",
      bloodSugarDtx: null,
    });
    expect(candidate.canonicalRow.fieldAssessments.weight.status).toBe("INVALID");
    expect(candidate.canonicalRow.fieldAssessments.height.status).toBe("INVALID");
    expect(candidate.canonicalRow.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "INVALID_VALUE", field: "weight" }),
        expect.objectContaining({ code: "UNSUPPORTED_REQUIREMENT", field: "height" }),
        expect.objectContaining({ code: "INVALID_VALUE", field: "bloodSugarDtx" }),
      ]),
    );

    const unknownUnitUpload = await createUpload([
      {
        name: "Unknown unit",
        rows: [
          coreHeaders("Height (m)"),
          [...coreRow(), 1.7],
        ],
      },
    ]);
    const [unknownUnitCandidate] = await readPatientImportCandidates(
      unknownUnitUpload,
      targetHospitalId,
    );

    expect(unknownUnitCandidate.canonicalRow.clinicalCandidates.height).toBeNull();
    expect(unknownUnitCandidate.fileMetadata?.unknownHeaders).toEqual(["Height (m)"]);
  });

  it("normalizes BOM, whitespace, punctuation, aliases, and a header row within the bounded scan", async () => {
    const upload = await createUpload([
      {
        name: "Data",
        rows: [
          ["template title"],
          [""],
          ["\uFEFF  National ID  ", "  ชื่อผู้ป่วย ", "นามสกุล", " HN ", "ชื่อผู้ดูแล(อสม)"],
          [...coreRow(), "โค้ชตัวอย่าง"],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.rowNumber).toBe(4);
    expect(candidate.canonicalRow.provenance.sourceSheetName).toBe("Data");
    expect(candidate.canonicalRow.caregiverCandidates.osmCaregiverName).toBe("โค้ชตัวอย่าง");
    expect(candidate.fileMetadata?.headerRowNumber).toBe(3);
  });

  it("selects the populated sheet after a template-only first sheet", async () => {
    const upload = await createUpload([
      { name: "Template", rows: [coreHeaders()] },
      { name: "Patients", rows: [coreHeaders(), coreRow()] },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.canonicalRow.provenance.sourceSheetName).toBe("Patients");
  });

  it("ignores a template hint row that has no patient-core signal", async () => {
    const operationalHeaders = [
      "National ID",
      "ชื่อผู้ป่วย",
      "นามสกุล",
      "HN",
      "วันเกิด(พ.ศ.)",
      "เพศ",
      "เบอร์โทรศัพท์",
      "น้ำหนัก (kg)",
      "ส่วนสูง(cm)",
      "รอบเอว (ซม.)",
      "ประเภทเบาหวาน",
      "ค่าน้ำตาล",
      "HbA1c",
      "โรงพยาบาล",
      "รพ.สต.",
      "บ้านเลขที่",
      "หมู่ที่",
      "หมู่บ้าน",
      "ซอย",
      "ถนน",
      "จังหวัด",
      "อำเภอ",
      "ตำบล",
      "รหัสไปรษณีย์",
      "ชื่อผู้ติดต่อ",
      "เบอร์ผู้ติดต่อ",
      "ความสัมพันธ์",
      "โค้ช",
      "PID",
      "BP",
      "P",
      "BMI",
      "ค่า DTX",
      "ปัญหา/ปัจจัยเสี่ยง",
    ];
    const templateHintRow: CellValue[] = operationalHeaders.map(() => "");
    templateHintRow[10] = "กลุ่มเสี่ยง หรือ เบาหวาน";
    const patientRow: CellValue[] = operationalHeaders.map(() => "");
    patientRow[0] = "1000000000009";
    patientRow[1] = "ตัวอย่าง";
    patientRow[2] = "ผู้ป่วย";
    patientRow[3] = "HN-SYN-001";

    const upload = await createUpload([
      { name: "Template", rows: [operationalHeaders, templateHintRow] },
      { name: "Patients", rows: [operationalHeaders, patientRow] },
    ]);

    const candidates = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].canonicalRow.provenance.sourceSheetName).toBe("Patients");
    expect(candidates[0].canonicalRow.identity.givenName).toBe("ตัวอย่าง");
  });

  it("rejects multiple equally populated patient worksheets", async () => {
    const upload = await createUpload([
      { name: "Patients A", rows: [coreHeaders(), coreRow()] },
      { name: "Patients B", rows: [coreHeaders(), coreRow("1000000000017")] },
    ]);

    await expect(readPatientImportCandidates(upload, targetHospitalId)).rejects.toEqual(
      expect.objectContaining({
        code: "VALIDATION",
        message: "พบแผ่นงานผู้ป่วยที่มีข้อมูลมากกว่าหนึ่งแผ่น กรุณาแยกไฟล์ก่อนนำเข้า",
      } satisfies Partial<ValidationError>),
    );
  });

  it("resolves the known duplicate generic phone layout using emergency anchors", async () => {
    const upload = await createUpload([
      {
        name: "Known contact group",
        rows: [
          [
            ...coreHeaders(),
            "เบอร์โทร",
            "วันเกิด(พ.ศ.)",
            "ชื่อผู้ติดต่อ(ญาติ)",
            "เบอร์โทร",
            "ความสัมพันธ์",
            "ชื่อผู้ดูแล (อสม.)",
          ],
          [
            ...coreRow(),
            "0811111111",
            "04/05/2568",
            "ญาติสังเคราะห์",
            "0822222222",
            "พี่น้อง",
            "อสม.สังเคราะห์",
          ],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.canonicalRow.contact.phoneNumber).toBe("0811111111");
    expect(candidate.canonicalRow.contact.emergencyContactPhone).toBe("0822222222");
    expect(candidate.fileMetadata?.ambiguousHeaders).not.toContain("เบอร์โทร");
    expect(candidate.canonicalRow.fieldAssessments.phoneNumber.status).toBe(
      "PARSED_REQUIREMENT_GATED",
    );
    expect(candidate.canonicalRow.fieldAssessments.emergencyContactPhone.status).toBe(
      "PARSED_REQUIREMENT_GATED",
    );
  });

  it("resolves the known duplicate generic phone layout with the alternate contact-name alias", async () => {
    const upload = await createUpload([
      {
        name: "Known alternate contact group",
        rows: [
          [...coreHeaders(), "เบอร์โทร", "ชื่อผู้ติดต่อ", "เบอร์โทร", "ความสัมพันธ์"],
          [...coreRow(), "0811111111", "ญาติสังเคราะห์", "0822222222", "พี่น้อง"],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.canonicalRow.contact.phoneNumber).toBe("0811111111");
    expect(candidate.canonicalRow.contact.emergencyContactPhone).toBe("0822222222");
    expect(candidate.fileMetadata?.ambiguousHeaders).not.toContain("เบอร์โทร");
  });

  it("does not guess the meaning of duplicated generic phone headers", async () => {
    const upload = await createUpload([
      {
        name: "Ambiguous",
        rows: [
          [...coreHeaders("เบอร์โทร", "เบอร์โทร")],
          [...coreRow(), "0811111111", "0822222222"],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.input).not.toBeNull();
    expect(candidate.canonicalRow.contact.phoneNumber).toBeNull();
    expect(candidate.canonicalRow.fieldAssessments.phoneNumber.status).toBe("AMBIGUOUS");
    expect(candidate.fileMetadata?.ambiguousHeaders).toEqual(["เบอร์โทร", "เบอร์โทร"]);
  });

  it("keeps explicit emergency phone aliases separate from patient phone", async () => {
    const upload = await createUpload([
      {
        name: "Explicit contact phone",
        rows: [
          [...coreHeaders(), "เบอร์โทร", "ชื่อผู้ติดต่อ", "เบอร์ผู้ติดต่อ", "ความสัมพันธ์"],
          [...coreRow(), "0811111111", "ญาติสังเคราะห์", "0822222222", "พี่น้อง"],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.canonicalRow.contact.phoneNumber).toBe("0811111111");
    expect(candidate.canonicalRow.contact.emergencyContactPhone).toBe("0822222222");
    expect(candidate.fileMetadata?.ambiguousHeaders).toEqual([]);
  });

  it("keeps National ID lossiness and phone leading-zero loss visible without reconstruction", async () => {
    const upload = await createUpload([
      {
        name: "Lossy values",
        rows: [
          [...coreHeaders("เบอร์โทร")],
          [...coreRow("1.0008E+12"), 812345678],
          [...coreRow("1000000000017"), 812345679],
          [...coreRow("1000000000025"), "1-0000-0000-0025"],
          [1000000000033, "ตัวอย่างสี่", "ผู้ป่วยสี่", "HN-SYN-004", "0831234567"],
        ],
      },
    ]);

    const candidates = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidates[0].input).toBeNull();
    expect(candidates[0].canonicalRow.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LOSSY_EXCEL_VALUE" })]),
    );
    expect(candidates[1].canonicalRow.contact.phoneNumber).toBe("812345679");
    expect(candidates[1].canonicalRow.fieldAssessments.phoneNumber.status).toBe("AMBIGUOUS");
    expect(candidates[1].canonicalRow.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LOSSY_EXCEL_VALUE" })]),
    );
    expect(candidates[2].input).not.toBeNull();
    expect(candidates[3].input).not.toBeNull();
  });

  it("keeps combined names as review data and never splits them", async () => {
    const upload = await createUpload([
      {
        name: "Combined name",
        rows: [
          ["National ID", "ชื่อ สกุล", "HN"],
          ["1-0000-0000-0009", "ตัวอย่าง ผู้ป่วย", "HN-SYN-001"],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.input).toBeNull();
    expect(candidate.combinedNameText).toBe("ตัวอย่าง ผู้ป่วย");
    expect(candidate.validationMessage).toContain("ยังไม่สามารถแยกชื่อและนามสกุล");
  });

  it("does not interpret an ambiguous numeric text date without a known DMY profile", async () => {
    const upload = await createUpload([
      {
        name: "Unknown date",
        rows: [
          ["National ID", "First name", "Last name", "HN", "DOB"],
          [...coreRow(), "04/05/2568"],
        ],
      },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidate.canonicalRow.demographics.dateOfBirth).toBeNull();
    expect(candidate.canonicalRow.fieldAssessments.dateOfBirth.status).toBe("AMBIGUOUS");
    expect(candidate.canonicalRow.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "AMBIGUOUS_VALUE" })]),
    );
  });

  it("normalizes explicit Thai month text and Excel date cells as date-only values", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Dates");
    worksheet.addRow(["National ID", "First name", "Last name", "HN", "วันเกิด"]);
    worksheet.addRow([...coreRow(), "4 พฤษภาคม 2568"]);
    worksheet.addRow(["1000000000017", "ตัวอย่างสอง", "ผู้ป่วยสอง", "HN-SYN-002", new Date(Date.UTC(2010, 0, 2))]);
    const buffer = await workbook.xlsx.writeBuffer();
    const upload = new File([buffer], "dates.xlsx");

    const candidates = await readPatientImportCandidates(upload, targetHospitalId);

    expect(candidates.map((candidate) => candidate.canonicalRow.demographics.dateOfBirth)).toEqual([
      "2025-05-04",
      "2010-01-02",
    ]);
  });

  it("keeps unknown headers visible and supports a bounded 64-column roster", async () => {
    const headers = [...coreHeaders(), "คอลัมน์สังเคราะห์ที่ยังไม่รองรับ"];
    const upload = await createUpload([
      { name: "Wide", rows: [headers, [...coreRow(), "ค่าไม่ถูกบันทึก"]] },
    ]);

    const [candidate] = await readPatientImportCandidates(upload, targetHospitalId);

    expect(MAX_PATIENT_IMPORT_COLUMNS).toBe(64);
    expect(candidate.fileMetadata?.unknownHeaders).toEqual(["คอลัมน์สังเคราะห์ที่ยังไม่รองรับ"]);
  });

  it("rejects rows beyond the existing 500-row bound and columns beyond the new bounded limit", async () => {
    const rows: string[][] = [coreHeaders()];
    for (let index = 0; index <= MAX_PATIENT_IMPORT_ROWS; index += 1) {
      rows.push(coreRow(`100000000${String(index + 300).padStart(4, "0")}`));
    }

    const tooManyRowsUpload = await createUpload([{ name: "Too many rows", rows }]);
    await expect(readPatientImportCandidates(tooManyRowsUpload, targetHospitalId)).rejects.toThrow(
      `ไฟล์ Excel รองรับผู้ป่วยไม่เกิน ${MAX_PATIENT_IMPORT_ROWS} แถว`,
    );

    const tooManyColumns = Array.from({ length: MAX_PATIENT_IMPORT_COLUMNS + 1 }, (_, index) => `column-${index}`);
    const tooManyColumnsUpload = await createUpload([
      { name: "Too many columns", rows: [tooManyColumns, tooManyColumns] },
    ]);
    await expect(readPatientImportCandidates(tooManyColumnsUpload, targetHospitalId)).rejects.toBeInstanceOf(ValidationError);
  });
});
