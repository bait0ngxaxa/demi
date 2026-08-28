import { describe, expect, it } from "vitest";

import {
  PATIENT_IMPORT_CONTRACT_VERSION,
  type PatientImportFieldKey,
} from "../import/patient-import-contract";
import type {
  PatientImportClassificationPreview,
  PatientImportOsmAssignmentPreview,
  PatientImportPreviewRow,
  PatientImportResultSummary,
  PatientImportRowResult,
} from "../services/patient-roster-import-types";
import type {
  PatientImportOsmAssignmentReconciliationBinding,
  PatientImportOsmCandidateBinding,
  PatientImportPreviewBinding,
} from "../transport/action-state";
import {
  countPatientImportExecutableRows,
  countPatientImportRowsRequiringAttention,
  getPatientImportAttentionReason,
  getPatientImportRecoveryGuidance,
  getPatientImportResultPresentation,
  getPatientImportRowPresentationStatus,
  isPatientImportRowImportable,
  summarizePatientImportPreview,
} from "./patient-import-presentation";

const identityDisplay = "••••••0009";
const targetHospitalId = "11111111-1111-4111-8111-111111111111";

const defaultClassification: PatientImportClassificationPreview = {
  status: "NOT_APPLICABLE",
  currentClassification: null,
  sourceClassification: null,
};

const defaultOsmAssignment: PatientImportOsmAssignmentPreview = {
  resolutionStatus: "OSM_NOT_APPLICABLE",
  assignmentStatus: null,
  sourceCaregiverName: null,
  currentCaregiver: null,
  resolvedCandidate: null,
  candidates: [],
};

function createRow(
  overrides: Partial<PatientImportPreviewRow> = {},
): PatientImportPreviewRow {
  return {
    rowNumber: 2,
    identityDisplay,
    givenName: "สมชาย",
    familyName: "ผู้ป่วย",
    combinedNameText: null,
    hospitalNumber: "HN-001",
    classification: "READY",
    reason: null,
    baselineStatus: "NOT_APPLICABLE",
    requirementGatedFields: [] satisfies readonly PatientImportFieldKey[],
    diagnosticCodes: [],
    patientClassification: {
      ...defaultClassification,
      ...overrides.patientClassification,
    },
    patientOsmAssignment: {
      ...defaultOsmAssignment,
      ...overrides.patientOsmAssignment,
    },
    ...overrides,
  };
}

function createPreview(
  overrides: Partial<PatientImportPreviewBinding> = {},
): PatientImportPreviewBinding {
  return {
    targetHospitalId,
    effectiveDate: null,
    importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
    baselineDateRequired: false,
    canManageOsmAssignment: true,
    rows: [],
    file: null,
    classificationReconciliations: [],
    osmAssignmentReconciliations: [],
    fileFingerprint: "fingerprint",
    previewBinding: "binding",
    ...overrides,
  };
}

function createOsmCandidate(
  overrides: Partial<PatientImportOsmCandidateBinding> = {},
): PatientImportOsmCandidateBinding {
  return {
    displayName: "สมหญิง ผู้ดูแล",
    candidateToken: "candidate-token",
    candidateReferenceToken: "candidate-reference-token",
    sameAsCurrent: false,
    reassignmentToken: "reassignment-token",
    ...overrides,
  };
}

function createOsmReconciliation(
  candidate: PatientImportOsmCandidateBinding,
  overrides: Partial<PatientImportOsmAssignmentReconciliationBinding> = {},
): PatientImportOsmAssignmentReconciliationBinding {
  return {
    rowNumber: 2,
    resolutionStatus: "OSM_MATCHED",
    sourceCaregiverName: candidate.displayName,
    currentCaregiver: null,
    assignmentStatus: "OSM_ASSIGNMENT_READY",
    candidates: [candidate],
    ...overrides,
  };
}

function createMatchedOsmRow(
  overrides: Partial<PatientImportOsmAssignmentPreview> = {},
): PatientImportPreviewRow {
  return createRow({
    patientOsmAssignment: {
      ...defaultOsmAssignment,
      resolutionStatus: "OSM_MATCHED",
      assignmentStatus: "OSM_ASSIGNMENT_READY",
      sourceCaregiverName: "สมหญิง ผู้ดูแล",
      resolvedCandidate: { displayName: "สมหญิง ผู้ดูแล" },
      candidates: [{ displayName: "สมหญิง ผู้ดูแล" }],
      ...overrides,
    },
  });
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
    needsReview: 0,
    hospitalMismatch: 0,
    unsupportedRequirement: 0,
    failed: 0,
    baselineCreated: 0,
    baselineAlreadyExists: 0,
    baselineConflict: 0,
    baselineInvalid: 0,
    baselineDateRequired: 0,
    classificationCreated: 0,
    classificationAlreadyExists: 0,
    classificationChanged: 0,
    classificationNeedsReview: 0,
    classificationInvalid: 0,
    osmAssigned: 0,
    osmAlreadyAssigned: 0,
    osmReassigned: 0,
    osmNotFound: 0,
    osmAmbiguous: 0,
    osmAssignmentConflict: 0,
    osmOwnerRequired: 0,
    rows: [],
    file: null,
    ...overrides,
  };
}

describe("patient import presentation helpers", () => {
  it("summarizes attention without counting idempotent rows", () => {
    const summary = summarizePatientImportPreview([
      createRow({ classification: "READY" }),
      createRow({ rowNumber: 3, classification: "ALREADY_EXISTS" }),
      createRow({ rowNumber: 4, classification: "INVALID" }),
      createRow({ rowNumber: 5, classification: "CONFLICT" }),
      createRow({ rowNumber: 6, classification: "DUPLICATE_IN_FILE" }),
      createRow({ rowNumber: 7, classification: "NEEDS_REVIEW" }),
      createRow({ rowNumber: 8, classification: "UNSUPPORTED_REQUIREMENT" }),
    ]);

    expect(summary).toEqual({
      total: 7,
      ready: 1,
      alreadyExists: 1,
      attention: 5,
      invalid: 1,
    });
  });

  it("keeps the readiness rules aligned with confirmation requirements", () => {
    const readyRow = createRow();
    expect(isPatientImportRowImportable(readyRow, createPreview(), new Set(), new Set())).toBe(true);

    const alreadyExistsRow = createRow({ classification: "ALREADY_EXISTS" });
    expect(isPatientImportRowImportable(alreadyExistsRow, createPreview(), new Set(), new Set())).toBe(true);

    const classificationRow = createRow({
      classification: "NEEDS_REVIEW",
      patientClassification: {
        status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
      },
    });
    const classificationPreview = createPreview({
      rows: [classificationRow],
      classificationReconciliations: [{
        rowNumber: classificationRow.rowNumber,
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
        confirmationToken: "classification-token",
      }],
    });
    expect(isPatientImportRowImportable(classificationRow, classificationPreview, new Set(), new Set())).toBe(false);
    expect(
      isPatientImportRowImportable(
        classificationRow,
        classificationPreview,
        new Set([classificationRow.rowNumber]),
        new Set(),
      ),
    ).toBe(true);

    const initialOsmRow = createMatchedOsmRow();
    const initialOsmCandidate = createOsmCandidate({ sameAsCurrent: false });
    const initialOsmPreview = createPreview({
      rows: [initialOsmRow],
      osmAssignmentReconciliations: [createOsmReconciliation(initialOsmCandidate)],
    });
    expect(isPatientImportRowImportable(initialOsmRow, initialOsmPreview, new Set(), new Set())).toBe(true);

    const reassignmentRow = createMatchedOsmRow({
      assignmentStatus: "OSM_ASSIGNMENT_CONFLICT",
      currentCaregiver: { displayName: "สมชาย ผู้ดูแลเดิม" },
    });
    const reassignmentCandidate = createOsmCandidate({ sameAsCurrent: false });
    const reassignmentPreview = createPreview({
      rows: [reassignmentRow],
      osmAssignmentReconciliations: [createOsmReconciliation(reassignmentCandidate, {
        currentCaregiver: { displayName: "สมชาย ผู้ดูแลเดิม" },
        assignmentStatus: "OSM_ASSIGNMENT_CONFLICT",
      })],
    });
    expect(isPatientImportRowImportable(reassignmentRow, reassignmentPreview, new Set(), new Set())).toBe(false);
    expect(
      isPatientImportRowImportable(
        reassignmentRow,
        reassignmentPreview,
        new Set(),
        new Set([reassignmentRow.rowNumber]),
      ),
    ).toBe(true);

    const ownerRequiredRow = createMatchedOsmRow({
      assignmentStatus: "OSM_OWNER_REQUIRED",
    });
    const ownerRequiredPreview = createPreview({
      canManageOsmAssignment: false,
      rows: [ownerRequiredRow],
    });
    expect(isPatientImportRowImportable(ownerRequiredRow, ownerRequiredPreview, new Set(), new Set())).toBe(false);

    const ambiguousRow = createRow({
      classification: "NEEDS_REVIEW",
      patientOsmAssignment: {
        ...defaultOsmAssignment,
        resolutionStatus: "OSM_AMBIGUOUS",
        sourceCaregiverName: "ผู้ดูแลชื่อซ้ำ",
        candidates: [{ displayName: "ผู้ดูแลชื่อซ้ำ" }, { displayName: "ผู้ดูแลชื่อซ้ำ" }],
      },
    });
    expect(isPatientImportRowImportable(ambiguousRow, createPreview({ rows: [ambiguousRow] }), new Set(), new Set())).toBe(false);

    const baselineConflictRow = createRow({
      classification: "CONFLICT",
      baselineStatus: "BASELINE_CONFLICT",
    });
    expect(isPatientImportRowImportable(baselineConflictRow, createPreview(), new Set(), new Set())).toBe(false);

    const hospitalMismatchRow = createRow({ classification: "HOSPITAL_MISMATCH" });
    expect(isPatientImportRowImportable(hospitalMismatchRow, createPreview(), new Set(), new Set())).toBe(false);
  });

  it("requires every confirmation when classification and OSM both change", () => {
    const candidate = createOsmCandidate();
    const row = createRow({
      classification: "NEEDS_REVIEW",
      patientClassification: {
        status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
      },
      patientOsmAssignment: {
        ...defaultOsmAssignment,
        resolutionStatus: "OSM_MATCHED",
        assignmentStatus: "OSM_ASSIGNMENT_CONFLICT",
        sourceCaregiverName: candidate.displayName,
        currentCaregiver: { displayName: "สมชาย ผู้ดูแลเดิม" },
        resolvedCandidate: { displayName: candidate.displayName },
        candidates: [{ displayName: candidate.displayName }],
      },
    });
    const preview = createPreview({
      rows: [row],
      classificationReconciliations: [{
        rowNumber: row.rowNumber,
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
        confirmationToken: "classification-token",
      }],
      osmAssignmentReconciliations: [createOsmReconciliation(candidate, {
        currentCaregiver: { displayName: "สมชาย ผู้ดูแลเดิม" },
        assignmentStatus: "OSM_ASSIGNMENT_CONFLICT",
      })],
    });

    expect(countPatientImportExecutableRows(preview, new Set(), new Set())).toBe(0);
    expect(countPatientImportExecutableRows(preview, new Set([2]), new Set())).toBe(0);
    expect(countPatientImportExecutableRows(preview, new Set(), new Set([2]))).toBe(0);
    expect(countPatientImportExecutableRows(preview, new Set([2]), new Set([2]))).toBe(1);
    expect(countPatientImportRowsRequiringAttention(preview, new Set(), new Set())).toBe(1);
    expect(countPatientImportRowsRequiringAttention(preview, new Set([2]), new Set())).toBe(1);
    expect(countPatientImportRowsRequiringAttention(preview, new Set([2]), new Set([2]))).toBe(0);
  });

  it("projects confirmation-satisfied rows as READY without changing server classification", () => {
    const readyRow = createRow({ classification: "READY" });
    expect(
      getPatientImportRowPresentationStatus(readyRow, createPreview(), new Set(), new Set()),
    ).toBe("READY");

    const alreadyExistsRow = createRow({ classification: "ALREADY_EXISTS" });
    expect(
      getPatientImportRowPresentationStatus(
        alreadyExistsRow,
        createPreview(),
        new Set(),
        new Set(),
      ),
    ).toBe("ALREADY_EXISTS");

    const invalidRow = createRow({ classification: "INVALID" });
    expect(
      getPatientImportRowPresentationStatus(invalidRow, createPreview(), new Set(), new Set()),
    ).toBe("INVALID");

    const classificationRow = createRow({
      classification: "NEEDS_REVIEW",
      patientClassification: {
        ...defaultClassification,
        status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
      },
    });
    const classificationPreview = createPreview({
      rows: [classificationRow],
      classificationReconciliations: [{
        rowNumber: classificationRow.rowNumber,
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
        confirmationToken: "classification-token",
      }],
    });
    expect(
      getPatientImportRowPresentationStatus(
        classificationRow,
        classificationPreview,
        new Set(),
        new Set(),
      ),
    ).toBe("NEEDS_REVIEW");
    expect(
      getPatientImportRowPresentationStatus(
        classificationRow,
        classificationPreview,
        new Set([classificationRow.rowNumber]),
        new Set(),
      ),
    ).toBe("READY");

    const candidate = createOsmCandidate();
    const osmRow = createRow({
      classification: "NEEDS_REVIEW",
      patientOsmAssignment: {
        ...defaultOsmAssignment,
        resolutionStatus: "OSM_MATCHED",
        assignmentStatus: "OSM_ASSIGNMENT_CONFLICT",
        sourceCaregiverName: candidate.displayName,
        currentCaregiver: { displayName: "สมชาย ผู้ดูแลเดิม" },
        resolvedCandidate: { displayName: candidate.displayName },
        candidates: [{ displayName: candidate.displayName }],
      },
    });
    const osmPreview = createPreview({
      rows: [osmRow],
      osmAssignmentReconciliations: [createOsmReconciliation(candidate, {
        currentCaregiver: { displayName: "สมชาย ผู้ดูแลเดิม" },
        assignmentStatus: "OSM_ASSIGNMENT_CONFLICT",
      })],
    });
    expect(
      getPatientImportRowPresentationStatus(osmRow, osmPreview, new Set(), new Set()),
    ).toBe("NEEDS_REVIEW");
    expect(
      getPatientImportRowPresentationStatus(
        osmRow,
        osmPreview,
        new Set(),
        new Set([osmRow.rowNumber]),
      ),
    ).toBe("READY");

    const combinedRow = createRow({
      classification: "NEEDS_REVIEW",
      patientClassification: {
        ...defaultClassification,
        status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
      },
      patientOsmAssignment: osmRow.patientOsmAssignment,
    });
    const combinedPreview = createPreview({
      rows: [combinedRow],
      classificationReconciliations: [{
        rowNumber: combinedRow.rowNumber,
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
        confirmationToken: "classification-token",
      }],
      osmAssignmentReconciliations: [createOsmReconciliation(candidate, {
        rowNumber: combinedRow.rowNumber,
        currentCaregiver: { displayName: "สมชาย ผู้ดูแลเดิม" },
        assignmentStatus: "OSM_ASSIGNMENT_CONFLICT",
      })],
    });
    expect(
      getPatientImportRowPresentationStatus(
        combinedRow,
        combinedPreview,
        new Set(),
        new Set(),
      ),
    ).toBe("NEEDS_REVIEW");
    expect(
      getPatientImportRowPresentationStatus(
        combinedRow,
        combinedPreview,
        new Set([combinedRow.rowNumber]),
        new Set(),
      ),
    ).toBe("NEEDS_REVIEW");
    expect(
      getPatientImportRowPresentationStatus(
        combinedRow,
        combinedPreview,
        new Set(),
        new Set([combinedRow.rowNumber]),
      ),
    ).toBe("NEEDS_REVIEW");
    expect(
      getPatientImportRowPresentationStatus(
        combinedRow,
        combinedPreview,
        new Set([combinedRow.rowNumber]),
        new Set([combinedRow.rowNumber]),
      ),
    ).toBe("READY");
  });

  it("keeps non-confirmable OSM states blocked in the presentation", () => {
    const ownerRequiredRow = createRow({
      classification: "NEEDS_REVIEW",
      patientOsmAssignment: {
        ...defaultOsmAssignment,
        resolutionStatus: "OSM_MATCHED",
        assignmentStatus: "OSM_OWNER_REQUIRED",
        sourceCaregiverName: "ผู้ดูแลใหม่",
        currentCaregiver: { displayName: "ผู้ดูแลเดิม" },
        resolvedCandidate: { displayName: "ผู้ดูแลใหม่" },
        candidates: [{ displayName: "ผู้ดูแลใหม่" }],
      },
    });
    const ownerPreview = createPreview({ canManageOsmAssignment: false, rows: [ownerRequiredRow] });
    expect(
      getPatientImportRowPresentationStatus(ownerRequiredRow, ownerPreview, new Set(), new Set()),
    ).toBe("NEEDS_REVIEW");

    for (const resolutionStatus of [
      "OSM_AMBIGUOUS",
      "OSM_NOT_FOUND",
      "OSM_SELF_ASSIGNMENT_FORBIDDEN",
    ] as const) {
      const row = createRow({
        classification: "NEEDS_REVIEW",
        patientOsmAssignment: {
          ...defaultOsmAssignment,
          resolutionStatus,
          sourceCaregiverName: "ผู้ดูแลจากไฟล์",
        },
      });
      const preview = createPreview({ rows: [row] });
      expect(
        getPatientImportRowPresentationStatus(row, preview, new Set(), new Set()),
      ).toBe("NEEDS_REVIEW");
    }
  });

  it("maps final attention rows to only the recovery actions they need", () => {
    const classificationRow = createResultRow("NEEDS_REVIEW", {
      patientClassification: {
        ...defaultClassification,
        status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
      },
    });
    expect(getPatientImportRecoveryGuidance({ rows: [classificationRow] }).map(({ kind }) => kind))
      .toEqual(["CONFIRMATION_REQUIRED"]);

    const osmRow = createResultRow("NEEDS_REVIEW", {
      patientOsmAssignment: {
        ...defaultOsmAssignment,
        resolutionStatus: "OSM_MATCHED",
        assignmentStatus: "OSM_ASSIGNMENT_CONFLICT",
        sourceCaregiverName: "ผู้ดูแลใหม่",
        currentCaregiver: { displayName: "ผู้ดูแลเดิม" },
        resolvedCandidate: { displayName: "ผู้ดูแลใหม่" },
        candidates: [{ displayName: "ผู้ดูแลใหม่" }],
      },
    });
    expect(getPatientImportRecoveryGuidance({ rows: [osmRow] }).map(({ kind }) => kind))
      .toEqual(["CONFIRMATION_REQUIRED"]);

    const ownerRequiredRow = createResultRow("NEEDS_REVIEW", {
      patientOsmAssignment: {
        ...defaultOsmAssignment,
        resolutionStatus: "OSM_MATCHED",
        assignmentStatus: "OSM_OWNER_REQUIRED",
        sourceCaregiverName: "ผู้ดูแลใหม่",
        currentCaregiver: { displayName: "ผู้ดูแลเดิม" },
        resolvedCandidate: { displayName: "ผู้ดูแลใหม่" },
        candidates: [{ displayName: "ผู้ดูแลใหม่" }],
      },
    });
    expect(getPatientImportRecoveryGuidance({ rows: [ownerRequiredRow] }).map(({ kind }) => kind))
      .toEqual(["OWNER_REQUIRED"]);

    const failedRow = createResultRow("FAILED");
    expect(getPatientImportRecoveryGuidance({ rows: [failedRow] }).map(({ kind }) => kind))
      .toEqual(["RETRY_FAILED"]);

    const invalidRow = createResultRow("INVALID");
    const mismatchRow = createResultRow("HOSPITAL_MISMATCH");
    expect(
      getPatientImportRecoveryGuidance({ rows: [invalidRow, mismatchRow] }).map(({ kind }) => kind),
    ).toEqual(["DATA_REVIEW"]);

    const mixed = getPatientImportRecoveryGuidance({
      rows: [invalidRow, ownerRequiredRow, failedRow],
    });
    expect(mixed.map(({ kind }) => kind)).toEqual([
      "DATA_REVIEW",
      "OWNER_REQUIRED",
      "RETRY_FAILED",
    ]);
    expect(mixed.map(({ message }) => message).join(" ")).not.toContain("แก้ไขข้อมูลในไฟล์แล้วอัปโหลดใหม่");
  });

  it("keeps blocked-row explanations in operator language", () => {
    const cases: Array<[PatientImportPreviewRow, string]> = [
      [createRow({ classification: "HOSPITAL_MISMATCH" }), "ชื่อโรงพยาบาลในไฟล์ไม่ตรงกับโรงพยาบาลที่เลือก"],
      [createRow({ classification: "CONFLICT", baselineStatus: "BASELINE_CONFLICT" }), "ข้อมูลตั้งต้นแตกต่างจากข้อมูลที่บันทึกไว้แล้ว"],
      [createRow({
        classification: "NEEDS_REVIEW",
        patientClassification: {
          status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
          currentClassification: "RISK",
          sourceClassification: "DIABETES",
        },
      }), "สถานะผู้ป่วยจากไฟล์แตกต่างจากสถานะปัจจุบัน"],
      [createRow({
        classification: "NEEDS_REVIEW",
        patientOsmAssignment: {
          ...defaultOsmAssignment,
          resolutionStatus: "OSM_NOT_FOUND",
          sourceCaregiverName: "ไม่พบผู้ดูแล",
        },
      }), "ไม่พบผู้ดูแลในโรงพยาบาลนี้"],
      [createRow({
        classification: "NEEDS_REVIEW",
        patientOsmAssignment: {
          ...defaultOsmAssignment,
          resolutionStatus: "OSM_AMBIGUOUS",
          sourceCaregiverName: "ผู้ดูแลชื่อซ้ำ",
        },
      }), "พบผู้ดูแลชื่อเดียวกันมากกว่า 1 คน"],
      [createRow({
        classification: "NEEDS_REVIEW",
        patientOsmAssignment: {
          ...defaultOsmAssignment,
          resolutionStatus: "OSM_SELF_ASSIGNMENT_FORBIDDEN",
          sourceCaregiverName: "ผู้ดำเนินการ",
        },
      }), "ไม่สามารถกำหนดตนเองเป็นผู้ดูแลผู้ป่วยได้"],
      [createMatchedOsmRow({ assignmentStatus: "OSM_OWNER_REQUIRED" }), "ต้องให้ผู้ใช้งานสิทธิ์เจ้าของโรงพยาบาลเป็นผู้ยืนยันผู้ดูแล"],
    ];

    for (const [row, reason] of cases) {
      expect(getPatientImportAttentionReason(row)).toBe(reason);
    }
  });

  it("keeps all-idempotent, mixed, and all-blocked result copy truthful", () => {
    const allIdempotent = getPatientImportResultPresentation(createResultSummary({
      alreadyExists: 2,
      rows: [
        createResultRow("ALREADY_EXISTS"),
        createResultRow("ALREADY_EXISTS"),
      ],
    }));
    expect(allIdempotent).toMatchObject({
      variant: "success",
      heading: "ไฟล์นี้ไม่มีรายการที่ต้องแก้ไข",
      detail: "ไฟล์นี้ไม่มีรายการที่ต้องแก้ไข ข้อมูลที่มีอยู่แล้วไม่ได้ถูกสร้างซ้ำ",
      allIdempotent: true,
    });

    const mixed = getPatientImportResultPresentation(createResultSummary({
      imported: 1,
      needsReview: 1,
      rows: [createResultRow("NEEDS_REVIEW")],
    }));
    expect(mixed).toMatchObject({
      variant: "warning",
      heading: "นำเข้ารายการที่พร้อมเรียบร้อยแล้ว และยังมีบางรายการที่ต้องตรวจสอบ",
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
      detail: "รายการที่ต้องตรวจสอบยังไม่ถูกบันทึก",
      hasSuccessfulRows: false,
      hasAttentionRows: true,
    });
  });
});
