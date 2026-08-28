import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";
import {
  PATIENT_IMPORT_CONTRACT_VERSION,
  PATIENT_IMPORT_FIELD_KEYS,
  type PatientImportFieldAssessment,
  type PatientImportFieldAssessmentMap,
  type PatientProvisioningImportCandidate,
} from "../import/patient-import-contract";
import type { ProvisionPatientInput } from "../schemas/patient-provisioning-schemas";
import {
  patientRosterImportInternals,
  projectPatientRosterImportPreview,
} from "./patient-roster-import-service";
import {
  isPatientImportAttentionResult,
  type PatientImportPreviewRowInternal,
  type PatientImportRowResult,
} from "./patient-roster-import-types";

const targetHospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

const actor = {
  userId: actorUserId,
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{
    hospitalId: targetHospitalId,
    membershipType: MembershipType.OWNER,
    profession: null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
  osmHospitalRelationships: [],
} satisfies ActorContext;

const defaultInput = {
  identity: {
    namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
    value: "1000000000009",
  },
  givenName: "สมชาย",
  familyName: "ผู้ป่วย",
  targetHospitalId,
  hospitalNumber: "HN-001",
} satisfies ProvisionPatientInput;

const emptyAssessment: PatientImportFieldAssessment = {
  status: "NOT_PRESENT",
  present: false,
  sourceHeaders: [],
  diagnostics: [],
};

function createAssessments(
  overrides: Partial<PatientImportFieldAssessmentMap> = {},
): PatientImportFieldAssessmentMap {
  return Object.fromEntries(
    PATIENT_IMPORT_FIELD_KEYS.map((field) => [field, overrides[field] ?? emptyAssessment]),
  ) as PatientImportFieldAssessmentMap;
}

function createCandidate(options: {
  rowNumber?: number;
  input?: ProvisionPatientInput | null;
  hospitalName?: string | null;
  weight?: number | null;
  height?: number | null;
  waistCircumference?: number | null;
  bloodSugarDtx?: number | null;
  hba1c?: number | null;
  classification?: PatientClassificationType | null;
  osmCaregiverName?: string | null;
  assessments?: Partial<PatientImportFieldAssessmentMap>;
} = {}): PatientProvisioningImportCandidate {
  const input = options.input === undefined ? defaultInput : options.input;
  const assessments = createAssessments(options.assessments);

  return {
    rowNumber: options.rowNumber ?? 2,
    identityDisplay: "1000000000009",
    givenName: input?.givenName ?? "สมชาย",
    familyName: input?.familyName ?? "ผู้ป่วย",
    combinedNameText: null,
    hospitalNumber: input?.hospitalNumber ?? null,
    validationMessage: input ? null : "ข้อมูลแถวนี้ไม่ถูกต้อง",
    input,
    canonicalRow: {
      provenance: {
        sourceSheetName: "รายชื่อผู้ป่วย",
        sourceRowNumber: options.rowNumber ?? 2,
        sourceSequenceNumber: null,
      },
      identity: {
        nationalId: "1000000000009",
        externalPatientId: null,
        givenName: input?.givenName ?? "สมชาย",
        familyName: input?.familyName ?? "ผู้ป่วย",
        combinedNameText: null,
        ageAtRoster: null,
      },
      demographics: { dateOfBirth: null, gender: null },
      contact: {
        phoneNumber: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelationship: null,
      },
      address: {
        addressText: null,
        houseNumber: null,
        villageNumber: null,
        villageName: null,
        soi: null,
        road: null,
        province: null,
        district: null,
        subdistrict: null,
        postalCode: null,
      },
      clinicalCandidates: {
        weight: options.weight ?? null,
        height: options.height ?? null,
        heightUnit: options.height === null || options.height === undefined ? null : "cm",
        waistCircumference: options.waistCircumference ?? null,
        diabetesClassification: options.classification ?? null,
        bloodSugar: null,
        bloodSugarDtx: options.bloodSugarDtx ?? null,
        hba1c: options.hba1c ?? null,
        bloodPressureText: null,
        pulseRate: null,
        bmi: null,
        dtxReading: null,
        riskFactorText: null,
        serviceVisitDate: null,
        extendedMeasurementSeries: [],
      },
      organizationCandidates: {
        hospitalNumber: input?.hospitalNumber ?? null,
        hospitalName: options.hospitalName ?? null,
        subHospitalName: null,
        organizationCombinedText: null,
      },
      caregiverCandidates: { osmCaregiverName: options.osmCaregiverName ?? null },
      fieldAssessments: assessments,
      diagnostics: [],
    },
  };
}

function createInternalRow(
  overrides: Partial<PatientImportPreviewRowInternal> = {},
): PatientImportPreviewRowInternal {
  return {
    rowNumber: 2,
    identityDisplay: "1000000000009",
    givenName: "สมชาย",
    familyName: "ผู้ป่วย",
    combinedNameText: null,
    hospitalNumber: "HN-001",
    classification: "READY",
    reason: null,
    baselineStatus: "NOT_APPLICABLE",
    requirementGatedFields: [],
    diagnosticCodes: [],
    patientClassification: {
      status: "NOT_APPLICABLE",
      currentClassification: null,
      sourceClassification: null,
    },
    patientOsmAssignment: {
      resolutionStatus: "OSM_NOT_APPLICABLE",
      assignmentStatus: null,
      sourceCaregiverName: null,
      normalizedSourceCaregiverName: null,
      currentOsmUserId: null,
      currentCaregiverDisplayName: null,
      resolvedOsmUserId: null,
      resolvedCandidateDisplayName: null,
      candidates: [],
    },
    ...overrides,
  };
}

function createResult(
  result: PatientImportRowResult["result"],
  row: PatientImportPreviewRowInternal,
): PatientImportRowResult {
  return {
    ...row,
    patientOsmAssignment: {
      resolutionStatus: row.patientOsmAssignment.resolutionStatus,
      assignmentStatus: row.patientOsmAssignment.assignmentStatus,
      sourceCaregiverName: row.patientOsmAssignment.sourceCaregiverName,
      currentCaregiver: row.patientOsmAssignment.currentCaregiverDisplayName
        ? { displayName: row.patientOsmAssignment.currentCaregiverDisplayName }
        : null,
      resolvedCandidate: row.patientOsmAssignment.resolvedCandidateDisplayName
        ? { displayName: row.patientOsmAssignment.resolvedCandidateDisplayName }
        : null,
      candidates: row.patientOsmAssignment.candidates.map(({ displayName }) => ({ displayName })),
    },
    result,
  };
}

describe("Patient roster import application service", () => {
  it("normalizes options once and rejects invalid reconciliation choices", () => {
    expect(patientRosterImportInternals.normalizeImportOptions({})).toEqual({
      effectiveDate: null,
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      classificationReconciliationChoices: [],
      osmAssignmentChoices: [],
    });

    expect(() =>
      patientRosterImportInternals.normalizeImportOptions({ effectiveDate: "01/08/2026" }),
    ).toThrow("วันที่ข้อมูลตั้งต้นไม่ถูกต้อง");
    expect(() =>
      patientRosterImportInternals.normalizeImportOptions({
        classificationReconciliationChoices: [{
          rowNumber: 2,
          currentClassification: "RISK",
          sourceClassification: "RISK",
        }],
      }),
    ).toThrow("การยืนยันเปลี่ยนสถานะผู้ป่วยไม่ถูกต้อง");

    expect(
      patientRosterImportInternals.normalizeImportOptions({
        classificationReconciliationChoices: [{
          rowNumber: 501,
          currentClassification: "RISK",
          sourceClassification: "DIABETES",
        }],
        osmAssignmentChoices: [{
          rowNumber: 502,
          resolutionStatus: "OSM_MATCHED",
          sourceCaregiverName: "ผู้ดูแลสังเคราะห์",
          normalizedSourceCaregiverName: "ผู้ดูแลสังเคราะห์",
          candidateOsmUserId: "55555555-5555-4555-8555-555555555555",
          currentOsmUserId: null,
          explicitReassignment: false,
        }],
      }),
    ).toMatchObject({
      classificationReconciliationChoices: [{ rowNumber: 501 }],
      osmAssignmentChoices: [{ rowNumber: 502 }],
    });
  });

  it("normalizes candidates against the server-selected Hospital", () => {
    const outsideHospitalCandidate = createCandidate({
      input: { ...defaultInput, targetHospitalId: otherHospitalId },
    });
    const normalized = patientRosterImportInternals.normalizeImportCandidates(
      [outsideHospitalCandidate],
      targetHospitalId,
    );

    expect(normalized[0]).toMatchObject({
      input: null,
      validationMessage: "แถวนี้อยู่นอกขอบเขตโรงพยาบาลที่เลือก",
    });
  });

  it("preserves duplicate and Hospital mismatch precedence before domain composition", () => {
    const duplicate = patientRosterImportInternals.composePatientRosterPreviewRow({
      candidate: createCandidate(),
      hash: "identity-hash",
      duplicateCount: 2,
      existing: undefined,
      targetHospitalName: "โรงพยาบาลเป้าหมาย",
      eligibleOsmCandidatesByName: new Map(),
      actor,
      targetHospitalId,
      effectiveDate: null,
    });
    expect(duplicate.classification).toBe("DUPLICATE_IN_FILE");

    const duplicateAndHospitalMismatch = patientRosterImportInternals.composePatientRosterPreviewRow({
      candidate: createCandidate({ hospitalName: "โรงพยาบาลอื่น" }),
      hash: "identity-hash",
      duplicateCount: 2,
      existing: undefined,
      targetHospitalName: "โรงพยาบาลเป้าหมาย",
      eligibleOsmCandidatesByName: new Map(),
      actor,
      targetHospitalId,
      effectiveDate: null,
    });
    expect(duplicateAndHospitalMismatch.classification).toBe("HOSPITAL_MISMATCH");

    const hospitalMismatch = patientRosterImportInternals.composePatientRosterPreviewRow({
      candidate: createCandidate({ hospitalName: "โรงพยาบาลอื่น" }),
      hash: "identity-hash",
      duplicateCount: 1,
      existing: undefined,
      targetHospitalName: "โรงพยาบาลเป้าหมาย",
      eligibleOsmCandidatesByName: new Map(),
      actor,
      targetHospitalId,
      effectiveDate: null,
    });
    expect(hospitalMismatch.classification).toBe("HOSPITAL_MISMATCH");
  });

  it("composes Baseline and Classification states without turning blanks into assertions", () => {
    const blankCandidate = createCandidate();
    expect(
      patientRosterImportInternals.readBaselineImportState(blankCandidate, "2026-08-01").status,
    ).toBe("NOT_APPLICABLE");

    const baselineCandidate = createCandidate({ weight: 72.5 });
    expect(
      patientRosterImportInternals.readBaselineImportState(baselineCandidate, "2026-08-01"),
    ).toMatchObject({ status: "BASELINE_READY", presentFields: ["weight"] });
    expect(
      patientRosterImportInternals.readBaselineImportState(baselineCandidate, null).status,
    ).toBe("BASELINE_DATE_REQUIRED");

    const classificationCandidate = createCandidate({ classification: "DIABETES" });
    expect(
      patientRosterImportInternals.readPatientClassificationImportState(
        classificationCandidate,
        "RISK",
      ),
    ).toMatchObject({
      status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
      currentClassification: "RISK",
      sourceClassification: "DIABETES",
    });
  });

  it("resolves OSM candidates by exact name and preserves OWNER-only assignment state", () => {
    const osmCandidates = patientRosterImportInternals.buildEligibleOsmCandidateIndex([
      { osmUserId: "55555555-5555-4555-8555-555555555555", displayName: "สมหญิง ผู้ดูแล" },
      { osmUserId: "66666666-6666-4666-8666-666666666666", displayName: "คนอื่น" },
    ]);
    const preview = patientRosterImportInternals.buildPatientOsmAssignmentPreview(
      createCandidate({ osmCaregiverName: "  สมหญิง ผู้ดูแล " }),
      undefined,
      osmCandidates,
      actor,
      targetHospitalId,
    );

    expect(preview).toMatchObject({
      resolutionStatus: "OSM_MATCHED",
      assignmentStatus: "OSM_ASSIGNMENT_READY",
      resolvedOsmUserId: "55555555-5555-4555-8555-555555555555",
    });
  });

  it("keeps multiple domain diagnostics and blocks unresolved row execution", () => {
    const row = createInternalRow({
      classification: "NEEDS_REVIEW",
      patientClassification: {
        status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
      },
      patientOsmAssignment: {
        resolutionStatus: "OSM_MATCHED",
        assignmentStatus: "OSM_ASSIGNMENT_CONFLICT",
        sourceCaregiverName: "ผู้ดูแล",
        normalizedSourceCaregiverName: "ผู้ดูแล",
        currentOsmUserId: "77777777-7777-4777-8777-777777777777",
        currentCaregiverDisplayName: "ผู้ดูแลเดิม",
        resolvedOsmUserId: "88888888-8888-4888-8888-888888888888",
        resolvedCandidateDisplayName: "ผู้ดูแลใหม่",
        candidates: [{
          osmUserId: "88888888-8888-4888-8888-888888888888",
          displayName: "ผู้ดูแลใหม่",
        }],
      },
    });

    expect(patientRosterImportInternals.getResultStatusForPreview(row)).toBe("NEEDS_REVIEW");
    expect(row.patientClassification.status).toBe(
      "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
    );
    expect(row.patientOsmAssignment.assignmentStatus).toBe("OSM_ASSIGNMENT_CONFLICT");
  });

  it("projects public preview without authoritative OSM identifiers", () => {
    const row = createInternalRow({
      patientOsmAssignment: {
        resolutionStatus: "OSM_MATCHED",
        assignmentStatus: "OSM_ASSIGNMENT_READY",
        sourceCaregiverName: "ผู้ดูแล",
        normalizedSourceCaregiverName: "ผู้ดูแล",
        currentOsmUserId: "99999999-9999-4999-8999-999999999999",
        currentCaregiverDisplayName: "ผู้ดูแลเดิม",
        resolvedOsmUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        resolvedCandidateDisplayName: "ผู้ดูแลใหม่",
        candidates: [{
          osmUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          displayName: "ผู้ดูแลใหม่",
        }],
      },
    });
    const preview = projectPatientRosterImportPreview({
      targetHospitalId,
      effectiveDate: null,
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      baselineDateRequired: false,
      canManageOsmAssignment: true,
      rows: [row],
      classificationReconciliations: [],
      file: null,
    });

    expect(preview.rows[0]?.patientOsmAssignment).toEqual({
      resolutionStatus: "OSM_MATCHED",
      assignmentStatus: "OSM_ASSIGNMENT_READY",
      sourceCaregiverName: "ผู้ดูแล",
      currentCaregiver: { displayName: "ผู้ดูแลเดิม" },
      resolvedCandidate: { displayName: "ผู้ดูแลใหม่" },
      candidates: [{ displayName: "ผู้ดูแลใหม่" }],
    });
    expect(JSON.stringify(preview)).not.toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(JSON.stringify(preview)).not.toContain("99999999-9999-4999-8999-999999999999");
  });

  it("centralizes primary summary buckets and keeps domain counters overlapping by design", () => {
    const importedRow = createInternalRow({ rowNumber: 2, baselineStatus: "BASELINE_READY" });
    const alreadyExistsRow = createInternalRow({ rowNumber: 3 });
    const reviewRow = createInternalRow({
      rowNumber: 4,
      classification: "NEEDS_REVIEW",
      patientOsmAssignment: {
        resolutionStatus: "OSM_NOT_FOUND",
        assignmentStatus: null,
        sourceCaregiverName: "ไม่พบ",
        normalizedSourceCaregiverName: "ไม่พบ",
        currentOsmUserId: null,
        currentCaregiverDisplayName: null,
        resolvedOsmUserId: null,
        resolvedCandidateDisplayName: null,
        candidates: [],
      },
    });
    const invalidRow = createInternalRow({ rowNumber: 5, classification: "INVALID" });
    const rows = [
      createResult("IMPORTED", importedRow),
      createResult("ALREADY_EXISTS", alreadyExistsRow),
      createResult("NEEDS_REVIEW", reviewRow),
      createResult("INVALID", invalidRow),
    ];

    const summary = patientRosterImportInternals.summarizePatientRosterImportRows({
      targetHospitalId,
      rows,
      domainOutcomesByIndex: new Map([
        [2, {
          baselineStatus: "BASELINE_CREATED",
          classificationOperation: "CREATED",
          osmOperation: "ASSIGNED",
        }],
        [3, {
          baselineStatus: "BASELINE_ALREADY_EXISTS",
          classificationOperation: "NOOP",
          osmOperation: "NOOP",
        }],
      ]),
      classificationNeedsReviewIndexes: new Set([2]),
      file: null,
    });

    expect(summary).toMatchObject({
      imported: 1,
      alreadyExists: 1,
      needsReview: 1,
      invalid: 1,
      baselineCreated: 1,
      baselineAlreadyExists: 1,
      classificationCreated: 1,
      classificationAlreadyExists: 1,
      classificationNeedsReview: 1,
      osmAssigned: 1,
      osmAlreadyAssigned: 1,
      osmNotFound: 1,
    });
    expect(
      summary.imported +
        summary.alreadyExists +
        summary.duplicateInFile +
        summary.invalid +
        summary.conflict +
        summary.needsReview +
        summary.hospitalMismatch +
        summary.unsupportedRequirement +
        summary.failed,
    ).toBe(rows.length);
  });

  it("does not classify ALREADY_EXISTS as an attention result", () => {
    expect(isPatientImportAttentionResult("ALREADY_EXISTS")).toBe(false);
    expect(isPatientImportAttentionResult("IMPORTED")).toBe(false);
    expect(isPatientImportAttentionResult("NEEDS_REVIEW")).toBe(true);
    expect(isPatientImportAttentionResult("FAILED")).toBe(true);
  });
});
