import { describe, expect, it } from "vitest";

import {
  PATIENT_IMPORT_CONTRACT_VERSION,
  type PatientImportFieldKey,
} from "../import/patient-import-contract";
import type {
  PatientImportClassificationPreview,
  PatientImportPreview,
  PatientImportPreviewRow,
  PatientImportResultSummary,
  PatientImportRowResult,
} from "../services/patient-roster-import-types";
import {
  countPatientImportExecutableRows,
  countPatientImportRowsRequiringAttention,
  getPatientImportAttentionReason,
  getPatientImportRecoveryGuidance,
  getPatientImportResultPresentation,
  partitionPatientImportPreviewRows,
  summarizePatientImportPreview,
} from "./patient-import-presentation";

const identityDisplay = "••••••0009";
const targetHospitalId = "11111111-1111-4111-8111-111111111111";

const defaultClassification: PatientImportClassificationPreview = {
  status: "NOT_APPLICABLE",
  sourceClassification: null,
};

function createRow(overrides: Partial<PatientImportPreviewRow> = {}): PatientImportPreviewRow {
  return {
    rowNumber: 3,
    identityDisplay,
    givenName: "สมชาย",
    familyName: "ผู้ป่วย",
    hospitalNumber: "HN-001",
    classification: "READY",
    reason: null,
    baselineStatus: "NOT_APPLICABLE",
    requirementGatedFields: [] satisfies readonly PatientImportFieldKey[],
    diagnosticCodes: [],
    patientClassification: defaultClassification,
    ...overrides,
  };
}

function createPreview(overrides: Partial<PatientImportPreview> = {}): PatientImportPreview {
  return {
    targetHospitalId,
    effectiveDate: null,
    importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
    baselineDateRequired: false,
    rows: [],
    file: null,
    ...overrides,
  };
}

function createResultRow(
  result: PatientImportRowResult["result"],
  overrides: Partial<PatientImportPreviewRow> = {},
): PatientImportRowResult {
  return {
    ...createRow({
      classification: result === "IMPORTED" || result === "FAILED" ? "READY" : result,
      ...overrides,
    }),
    result,
  };
}

function createResultSummary(
  overrides: Partial<PatientImportResultSummary> = {},
): PatientImportResultSummary {
  return {
    targetHospitalId,
    imported: 0,
    alreadyExists: 0,
    duplicateInFile: 0,
    invalid: 0,
    conflict: 0,
    failed: 0,
    baselineCreated: 0,
    classificationCreated: 0,
    rows: [],
    file: null,
    ...overrides,
  };
}

describe("patient import presentation helpers", () => {
  it("summarizes new / already-existing / needs-correction rows", () => {
    const summary = summarizePatientImportPreview([
      createRow({ classification: "READY" }),
      createRow({ rowNumber: 4, classification: "ALREADY_EXISTS" }),
      createRow({ rowNumber: 5, classification: "INVALID" }),
      createRow({ rowNumber: 6, classification: "CONFLICT" }),
      createRow({ rowNumber: 7, classification: "DUPLICATE_IN_FILE" }),
    ]);

    expect(summary).toEqual({
      total: 5,
      ready: 1,
      alreadyExists: 1,
      attention: 3,
      invalid: 1,
    });
  });

  it("shows attention rows first, then new patients, and groups existing patients apart", () => {
    const rows = [
      createRow({ rowNumber: 3, classification: "ALREADY_EXISTS" }),
      createRow({ rowNumber: 4, classification: "READY" }),
      createRow({ rowNumber: 5, classification: "INVALID" }),
      createRow({ rowNumber: 6, classification: "ALREADY_EXISTS" }),
      createRow({ rowNumber: 7, classification: "CONFLICT" }),
    ];
    const { primaryRows, alreadyExistsRows } = partitionPatientImportPreviewRows(rows);

    expect(primaryRows.map(({ rowNumber }) => rowNumber)).toEqual([5, 7, 4]);
    expect(alreadyExistsRows.map(({ rowNumber }) => rowNumber)).toEqual([3, 6]);
  });

  it("counts only new patients as executable and never counts existing ones", () => {
    const rows = [
      createRow({ rowNumber: 3, classification: "READY" }),
      createRow({ rowNumber: 4, classification: "READY" }),
      createRow({ rowNumber: 5, classification: "ALREADY_EXISTS" }),
      createRow({ rowNumber: 6, classification: "INVALID" }),
    ];

    expect(countPatientImportExecutableRows(createPreview({ rows }))).toBe(2);
    expect(countPatientImportRowsRequiringAttention(createPreview({ rows }))).toBe(1);
  });

  it("blocks the whole import while the baseline date is still required", () => {
    expect(
      countPatientImportExecutableRows(
        createPreview({
          baselineDateRequired: true,
          rows: [createRow({ classification: "READY" })],
        }),
      ),
    ).toBe(0);
  });

  it("explains each attention row in operator language", () => {
    const cases: ReadonlyArray<readonly [PatientImportPreviewRow, string]> = [
      [createRow({ classification: "DUPLICATE_IN_FILE" }), "พบเลขบัตรประชาชนซ้ำในไฟล์เดียวกัน"],
      [
        createRow({ classification: "INVALID", baselineStatus: "BASELINE_DATE_REQUIRED" }),
        "ต้องระบุวันที่ข้อมูลตั้งต้นก่อนนำเข้า",
      ],
      [
        createRow({ classification: "INVALID", baselineStatus: "BASELINE_DATA_INVALID" }),
        "ข้อมูลตั้งต้นไม่ถูกต้องหรือไม่รองรับหน่วยที่ระบุ",
      ],
      [
        createRow({
          classification: "INVALID",
          patientClassification: {
            status: "CLASSIFICATION_DATA_INVALID",
            sourceClassification: null,
          },
        }),
        "สถานะผู้ป่วยจากไฟล์ไม่ใช่ค่าที่รองรับ",
      ],
      [
        createRow({ classification: "CONFLICT", reason: "HN ของความสัมพันธ์กับโรงพยาบาลนี้ไม่ตรงกัน" }),
        "HN ของความสัมพันธ์กับโรงพยาบาลนี้ไม่ตรงกัน",
      ],
      [createRow({ classification: "INVALID" }), "ข้อมูลหลักของแถวนี้ไม่ครบถ้วนหรือไม่ถูกต้อง"],
      [createRow({ classification: "CONFLICT" }), "ข้อมูลผู้ป่วยขัดแย้งกับข้อมูลเดิม"],
    ];

    for (const [row, reason] of cases) {
      expect(getPatientImportAttentionReason(row)).toBe(reason);
    }
  });

  it("recommends the failed-rows download only for rows the user can correct", () => {
    expect(getPatientImportRecoveryGuidance(createResultSummary())).toEqual([]);
    expect(
      getPatientImportRecoveryGuidance(
        createResultSummary({ rows: [createResultRow("ALREADY_EXISTS"), createResultRow("IMPORTED")] }),
      ),
    ).toEqual([]);

    const guidance = getPatientImportRecoveryGuidance(
      createResultSummary({
        rows: [createResultRow("INVALID"), createResultRow("DUPLICATE_IN_FILE"), createResultRow("FAILED")],
      }),
    );

    expect(guidance.map(({ kind }) => kind)).toEqual(["DATA_REVIEW", "RETRY_FAILED"]);
    expect(guidance[0]?.message).toContain("ดาวน์โหลดแถวที่ไม่ผ่าน");
    expect(guidance[0]?.detail).toContain("เหตุผล");
  });

  it("keeps all-idempotent, mixed, and all-blocked result copy truthful", () => {
    const allIdempotent = getPatientImportResultPresentation(createResultSummary({
      alreadyExists: 2,
      rows: [createResultRow("ALREADY_EXISTS"), createResultRow("ALREADY_EXISTS")],
    }));
    expect(allIdempotent).toMatchObject({
      variant: "success",
      heading: "ไม่มีผู้ป่วยใหม่ในไฟล์นี้",
      detail: "ผู้ป่วยที่มีอยู่แล้วไม่ถูกสร้างซ้ำและไม่ถูกเปลี่ยนแปลง",
      allIdempotent: true,
    });

    const mixed = getPatientImportResultPresentation(createResultSummary({
      imported: 1,
      conflict: 1,
      rows: [createResultRow("IMPORTED"), createResultRow("CONFLICT")],
    }));
    expect(mixed).toMatchObject({
      variant: "warning",
      heading: "นำเข้าผู้ป่วยใหม่เรียบร้อยแล้ว และยังมีบางรายการที่ต้องแก้ไข",
      hasSuccessfulRows: true,
      hasAttentionRows: true,
      reviewCount: 1,
    });

    const allBlocked = getPatientImportResultPresentation(createResultSummary({
      invalid: 1,
      rows: [createResultRow("INVALID")],
    }));
    expect(allBlocked).toMatchObject({
      variant: "danger",
      heading: "ยังไม่มีรายการที่บันทึกได้",
      detail: "รายการที่ต้องแก้ไขยังไม่ถูกบันทึก",
      hasSuccessfulRows: false,
      hasAttentionRows: true,
    });

    const clean = getPatientImportResultPresentation(createResultSummary({
      imported: 3,
      rows: [createResultRow("IMPORTED")],
    }));
    expect(clean).toMatchObject({
      variant: "success",
      heading: "นำเข้าข้อมูลเรียบร้อยแล้ว",
      detail: null,
      hasAttentionRows: false,
    });
  });
});
