import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ImportSummary,
  PreviewFileSummary,
  PreviewTable,
} from "../../../../app/app/patients/provision/patient-provisioning-workspace";
import { PATIENT_IMPORT_CONTRACT_VERSION } from "../import/patient-import-contract";
import type {
  PatientImportPreviewRow,
  PatientImportResultSummary,
  PatientImportRowResult,
} from "../services/patient-roster-import-types";
import type { PatientImportPreviewBinding } from "./action-state";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./server-actions", () => ({
  confirmPatientImportAction: vi.fn(),
  provisionPatientAction: vi.fn(),
  previewPatientImportAction: vi.fn(),
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";

function row(
  rowNumber: number,
  classification: PatientImportPreviewRow["classification"],
  overrides: Partial<PatientImportPreviewRow> = {},
): PatientImportPreviewRow {
  return {
    rowNumber,
    sourceSequenceNumber: null,
    identityDisplay: `••••••${String(rowNumber).padStart(4, "0")}`,
    givenName: `ชื่อ${rowNumber}`,
    familyName: "ทดสอบ",
    hospitalNumber: `HN-${rowNumber}`,
    classification,
    reason: null,
    baselineStatus: "NOT_APPLICABLE",
    requirementGatedFields: [],
    diagnosticCodes: [],
    patientClassification: { status: "NOT_APPLICABLE", sourceClassification: null },
    ...overrides,
  };
}

function preview(rows: PatientImportPreviewRow[], overrides: Partial<PatientImportPreviewBinding> = {}): PatientImportPreviewBinding {
  return {
    targetHospitalId: hospitalId,
    effectiveDate: null,
    importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
    baselineDateRequired: false,
    rows,
    file: null,
    fileFingerprint: "a".repeat(64),
    previewBinding: "b".repeat(64),
    ...overrides,
  };
}

function resultRow(
  rowNumber: number,
  result: PatientImportRowResult["result"],
  overrides: Partial<PatientImportPreviewRow> = {},
): PatientImportRowResult {
  return {
    ...row(rowNumber, result === "IMPORTED" || result === "FAILED" ? "READY" : result, overrides),
    result,
  };
}

function summary(rows: PatientImportRowResult[], overrides: Partial<PatientImportResultSummary> = {}): PatientImportResultSummary {
  return {
    targetHospitalId: hospitalId,
    imported: rows.filter(({ result }) => result === "IMPORTED").length,
    alreadyExists: rows.filter(({ result }) => result === "ALREADY_EXISTS").length,
    duplicateInFile: rows.filter(({ result }) => result === "DUPLICATE_IN_FILE").length,
    invalid: rows.filter(({ result }) => result === "INVALID").length,
    conflict: rows.filter(({ result }) => result === "CONFLICT").length,
    failed: rows.filter(({ result }) => result === "FAILED").length,
    baselineCreated: 0,
    classificationCreated: 0,
    rows,
    file: null,
    ...overrides,
  };
}

describe("import preview UI", () => {
  const rows = [
    row(3, "ALREADY_EXISTS", { givenName: "คนเดิมหนึ่ง" }),
    row(4, "READY", { givenName: "คนใหม่หนึ่ง" }),
    row(5, "INVALID", { givenName: "คนผิดหนึ่ง", reason: "เลขบัตรประชาชนไม่ถูกต้อง" }),
    row(6, "ALREADY_EXISTS", { givenName: "คนเดิมสอง" }),
  ];

  it("shows the summary as new / already existing / needs correction", () => {
    const markup = renderToStaticMarkup(
      createElement(PreviewFileSummary, { preview: preview(rows), executableRowCount: 1, attentionRowCount: 1 }),
    );

    expect(markup).toMatch(/ใหม่<\/dt><dd[^>]*>1</);
    expect(markup).toMatch(/มีอยู่แล้ว<\/dt><dd[^>]*>2</);
    expect(markup).toMatch(/ต้องแก้ไข<\/dt><dd[^>]*>1</);
  });

  it("shows attention and new rows first and collapses existing patients", () => {
    const markup = renderToStaticMarkup(createElement(PreviewTable, { preview: preview(rows) }));

    expect(markup.indexOf("คนผิดหนึ่ง")).toBeGreaterThan(-1);
    expect(markup.indexOf("คนผิดหนึ่ง")).toBeLessThan(markup.indexOf("คนใหม่หนึ่ง"));
    expect(markup).toContain("เลขบัตรประชาชนไม่ถูกต้อง");
    expect(markup).toContain("<details");
    expect(markup).not.toContain("<details open");
    expect(markup).toContain("ผู้ป่วยที่มีอยู่แล้ว 2 รายการ");
    expect(markup.indexOf("<details")).toBeLessThan(markup.indexOf("คนเดิมหนึ่ง"));
    expect(markup.indexOf("คนใหม่หนึ่ง")).toBeLessThan(markup.indexOf("<details"));
  });

  it("offers no reconciliation or OSM controls", () => {
    const markup = renderToStaticMarkup(createElement(PreviewTable, { preview: preview(rows) }));

    expect(markup).not.toContain('type="checkbox"');
    expect(markup).not.toContain("ผู้ดูแล");
    expect(markup).not.toContain("ยืนยันเปลี่ยน");
  });
});

describe("import result UI", () => {
  const file = new File(["x"], "patients.xlsx");
  const mixed = summary([
    resultRow(3, "IMPORTED"),
    resultRow(4, "ALREADY_EXISTS"),
    resultRow(5, "INVALID", { reason: "เลขบัตรประชาชนไม่ถูกต้อง" }),
    resultRow(6, "FAILED"),
  ]);

  function render(resultSummary: PatientImportResultSummary, canAssignOsm: boolean): string {
    return renderToStaticMarkup(
      createElement(ImportSummary, {
        summary: resultSummary,
        preview: preview([]),
        file,
        canAssignOsm,
        onNewImport: vi.fn(),
      }),
    );
  }

  it("offers the failed-rows download and the bulk OSM assignment to an owner", () => {
    const markup = render(mixed, true);

    expect(markup).toContain("ดาวน์โหลดแถวที่ไม่ผ่าน");
    expect(markup).toContain(`href="/app/patients/assign-osm?hospitalId=${hospitalId}"`);
    expect(markup).toContain("กำหนด อสม.");
    expect(markup).toContain("เลขบัตรประชาชนไม่ถูกต้อง");
    expect(markup).toContain("ไม่ต้องลบคอลัมน์");
  });

  it("does not offer OSM assignment to someone who may not assign", () => {
    const markup = render(mixed, false);

    expect(markup).not.toContain("/app/patients/assign-osm");
    expect(markup).toContain("เจ้าของโรงพยาบาลเป็นผู้กำหนด อสม. หลังนำเข้า");
    expect(markup).toContain("ดาวน์โหลดแถวที่ไม่ผ่าน");
  });

  it("offers neither download nor OSM link when nothing was imported and nothing failed", () => {
    const markup = render(summary([resultRow(3, "ALREADY_EXISTS"), resultRow(4, "ALREADY_EXISTS")]), true);

    expect(markup).not.toContain("ดาวน์โหลดแถวที่ไม่ผ่าน");
    expect(markup).not.toContain("/app/patients/assign-osm");
    expect(markup).toContain("ไม่มีผู้ป่วยใหม่ในไฟล์นี้");
  });
});
