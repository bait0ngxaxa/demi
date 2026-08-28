import { describe, expect, it } from "vitest";

import {
  EXCEL_MAX_ROW_NUMBER,
  patientImportClassificationReconciliationChoicesSchema,
  patientImportClassificationReconciliationSchema,
  patientImportOsmAssignmentBindingChoiceSchema,
  patientImportOsmAssignmentBindingChoicesSchema,
  patientImportOsmAssignmentChoiceSchema,
  patientImportOsmAssignmentChoicesSchema,
  patientImportSourceRowNumberSchema,
} from "./patient-provisioning-schemas";

const candidateOsmUserId = "11111111-1111-4111-8111-111111111111";
const confirmationToken = "a".repeat(64);

function classificationChoice(rowNumber: number): {
  rowNumber: number;
  currentClassification: "RISK";
  sourceClassification: "DIABETES";
} {
  return {
    rowNumber,
    currentClassification: "RISK",
    sourceClassification: "DIABETES",
  };
}

function osmChoice(rowNumber: number): {
  rowNumber: number;
  resolutionStatus: "OSM_MATCHED";
  sourceCaregiverName: string;
  normalizedSourceCaregiverName: string;
  candidateOsmUserId: string;
  currentOsmUserId: null;
  explicitReassignment: false;
} {
  return {
    rowNumber,
    resolutionStatus: "OSM_MATCHED",
    sourceCaregiverName: "ผู้ดูแลสังเคราะห์",
    normalizedSourceCaregiverName: "ผู้ดูแลสังเคราะห์",
    candidateOsmUserId,
    currentOsmUserId: null,
    explicitReassignment: false,
  };
}

function osmBindingChoice(rowNumber: number): {
  rowNumber: number;
  resolutionStatus: "OSM_MATCHED";
  candidateToken: string;
  candidateReferenceToken: string;
  explicitReassignment: false;
} {
  return {
    rowNumber,
    resolutionStatus: "OSM_MATCHED",
    candidateToken: confirmationToken,
    candidateReferenceToken: confirmationToken,
    explicitReassignment: false,
  };
}

describe("Patient import source row schemas", () => {
  it("accepts worksheet coordinates through the Excel row maximum", () => {
    for (const rowNumber of [1, 3, 500, 501, 502, EXCEL_MAX_ROW_NUMBER]) {
      expect(patientImportSourceRowNumberSchema.safeParse(rowNumber).success).toBe(true);
    }

    for (const rowNumber of [0, -1, 1.5, EXCEL_MAX_ROW_NUMBER + 1, Number.NaN]) {
      expect(patientImportSourceRowNumberSchema.safeParse(rowNumber).success).toBe(false);
    }
  });

  it("accepts source rows 501 and 502 in every reconciliation choice schema", () => {
    for (const rowNumber of [501, 502]) {
      expect(
        patientImportClassificationReconciliationSchema.safeParse(
          classificationChoice(rowNumber),
        ).success,
      ).toBe(true);
      expect(patientImportOsmAssignmentChoiceSchema.safeParse(osmChoice(rowNumber)).success).toBe(
        true,
      );
      expect(
        patientImportOsmAssignmentBindingChoiceSchema.safeParse(osmBindingChoice(rowNumber))
          .success,
      ).toBe(true);
    }
  });

  it("keeps reconciliation choice arrays capped at 500 items", () => {
    const classificationChoices = Array.from({ length: 501 }, (_, index) =>
      classificationChoice(index + 1),
    );
    const osmChoices = Array.from({ length: 501 }, (_, index) => osmChoice(index + 1));
    const osmBindingChoices = Array.from({ length: 501 }, (_, index) => osmBindingChoice(index + 1));

    expect(patientImportClassificationReconciliationChoicesSchema.safeParse(classificationChoices).success).toBe(
      false,
    );
    expect(patientImportOsmAssignmentChoicesSchema.safeParse(osmChoices).success).toBe(false);
    expect(patientImportOsmAssignmentBindingChoicesSchema.safeParse(osmBindingChoices).success).toBe(
      false,
    );
  });
});
