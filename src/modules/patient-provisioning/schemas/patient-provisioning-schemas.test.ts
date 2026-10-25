import { afterEach, describe, expect, it, vi } from "vitest";

import { PATIENT_IMPORT_CONTRACT_VERSION } from "../import/patient-import-contract";
import {
  EXCEL_MAX_ROW_NUMBER,
  patientImportConfirmSchema,
  patientImportFailedRowsSchema,
  patientProvisionFormSchema,
  patientImportSourceRowNumberSchema,
} from "./patient-provisioning-schemas";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const confirmation = {
  targetHospitalId: hospitalId,
  previewTargetHospitalId: hospitalId,
  fileFingerprint: "a".repeat(64),
  previewBinding: "b".repeat(64),
  importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("patient provisioning form schema", () => {
  it("accepts a checksum-invalid synthetic patient ID in a production-mode build", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");

    expect(
      patientProvisionFormSchema.safeParse({
        nationalId: "1111111111111",
        givenName: "ตัวอย่าง",
        familyName: "ผู้ป่วย",
        targetHospitalId: hospitalId,
      }).success,
    ).toBe(true);
  });
});

describe("Patient import source row schemas", () => {
  it("accepts worksheet coordinates through the Excel row maximum", () => {
    for (const rowNumber of [1, 3, 500, 501, 502, EXCEL_MAX_ROW_NUMBER]) {
      expect(patientImportSourceRowNumberSchema.safeParse(rowNumber).success).toBe(true);
    }

    for (const rowNumber of [0, -1, 1.5, EXCEL_MAX_ROW_NUMBER + 1, Number.NaN]) {
      expect(patientImportSourceRowNumberSchema.safeParse(rowNumber).success).toBe(false);
    }
  });
});

describe("Patient import confirm schemas", () => {
  it("accepts only the current import contract version and no reconciliation or OSM choices", () => {
    expect(patientImportConfirmSchema.safeParse(confirmation).success).toBe(true);
    expect(
      patientImportConfirmSchema.safeParse({ ...confirmation, importContractVersion: "phase-16d4-osm-assignment-v2" })
        .success,
    ).toBe(false);
    expect(
      patientImportConfirmSchema.safeParse({ ...confirmation, osmAssignmentChoices: "[]" }).success,
    ).toBe(false);
    expect(
      patientImportConfirmSchema.safeParse({ ...confirmation, classificationChoices: "[]" })
        .success,
    ).toBe(false);
  });

  it("bounds the failed-row numbers of the export request", () => {
    expect(patientImportFailedRowsSchema.parse(confirmation).failedRowNumbers).toEqual([]);
    expect(
      patientImportFailedRowsSchema.safeParse({ ...confirmation, failedRowNumbers: [3, 502] }).success,
    ).toBe(true);
    expect(
      patientImportFailedRowsSchema.safeParse({
        ...confirmation,
        failedRowNumbers: Array.from({ length: 501 }, (_, index) => index + 1),
      }).success,
    ).toBe(false);
    expect(
      patientImportFailedRowsSchema.safeParse({ ...confirmation, failedRowNumbers: [0] }).success,
    ).toBe(false);
  });
});
