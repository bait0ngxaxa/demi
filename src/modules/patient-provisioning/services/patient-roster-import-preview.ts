import "server-only";

import {
  Role,
  UserStatus,
} from "@prisma/client";
import { z } from "zod";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import {
  decidePatientOsmAssignmentPolicy,
  PATIENT_ASSIGN_OSM_CAPABILITY,
} from "@/modules/patient-assignment/policies/patient-osm-assignment-policy";
import {
  buildRosterOsmAssignmentPreview,
  listEligibleRosterOsmCandidates,
  normalizeRosterOsmCaregiverName,
  type PatientOsmRosterAssignmentPreviewInternal,
  type PatientOsmRosterCandidate,
} from "@/modules/patient-assignment/services/patient-osm-roster-resolver";
import { formatPatientOsmDisplayName } from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import {
  dateOnlyToUtcDate,
  patientBaselineCreateRequestSchema,
  patientBaselineDateOnlySchema,
  patientBaselineMeasurementSchema,
  type PatientBaselineCreateRequest,
} from "@/modules/patient-baseline/schemas/patient-baseline-schemas";
import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";
import { patientClassificationTypeSchema } from "@/modules/patient-classification/schemas/patient-classification-schemas";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  assertPatientBulkProvisioningPolicy,
  PATIENT_PROVISIONING_CAPABILITY,
} from "../policies/patient-provisioning-policy";
import {
  patientImportClassificationReconciliationSchema,
  patientImportOsmAssignmentChoiceSchema,
  patientProvisionInputSchema,
  patientProvisionScopeSchema,
} from "../schemas/patient-provisioning-schemas";
import { normalizePatientImportOrganizationText } from "../import/patient-import-layouts";
import {
  PATIENT_IMPORT_BASELINE_FIELD_KEYS,
  PATIENT_IMPORT_CONTRACT_VERSION,
  PATIENT_IMPORT_FIELD_KEYS,
  isPatientImportBaselineField,
  isPatientImportClassificationField,
  isPatientImportOsmAssignmentField,
  type PatientImportBaselineFieldKey,
  type PatientProvisioningImportCandidate,
} from "../import/patient-import-contract";
import {
  assertPatientProvisioningActorInDatabase,
  patientProvisioningTransactionInternals,
} from "./patient-provisioning-transaction";
import type {
  PatientImportBaselineStatus,
  PatientImportClassification,
  PatientImportClassificationPreview,
  PatientImportClassificationReconciliationChoice,
  PatientImportOptions,
  PatientImportOsmAssignmentChoice,
  PatientImportOsmAssignmentPreview,
  PatientImportPreview,
  PatientImportPreviewInternal,
  PatientImportPreviewRowInternal,
  PatientRosterImportDatabase,
  PatientRosterImportServiceDependencies,
} from "./patient-roster-import-types";

type PreviewPerson = {
  id: string;
  identityKeyHash: string;
  givenName: string | null;
  familyName: string | null;
  user: {
    id: string;
    status: UserStatus;
    authSubject: string | null;
    roles: { role: Role }[];
  } | null;
  patientProfile: {
    id: string;
    patientClassification: {
      classification: PatientClassificationType;
    } | null;
    hospitalRelationships: {
      id: string;
      hospitalNumber: string | null;
      baseline: PreviewBaseline | null;
      osmAssignments: {
        osmUserId: string;
        osmUser: {
          person: {
            givenName: string | null;
            familyName: string | null;
          };
        };
      }[];
    }[];
  } | null;
};

type PreviewBaseline = {
  recordedOn: Date;
  weight: number | null;
  heightCm: number | null;
  waistCircumference: number | null;
  bloodSugarDtx: number | null;
  hba1c: number | null;
};

type PreviewRelationship = NonNullable<PreviewPerson["patientProfile"]>["hospitalRelationships"][number];

type BaselineImportTargetField =
  | "weight"
  | "heightCm"
  | "waistCircumference"
  | "bloodSugarDtx"
  | "hba1c";

type BaselineImportValues = Record<BaselineImportTargetField, number | null>;

type BaselineImportState = {
  status: PatientImportBaselineStatus;
  effectiveDate: string | null;
  presentFields: readonly BaselineImportTargetField[];
  values: BaselineImportValues;
};

const baselineImportFieldMap: Readonly<
  Record<PatientImportBaselineFieldKey, BaselineImportTargetField>
> = {
  weight: "weight",
  height: "heightCm",
  waistCircumference: "waistCircumference",
  bloodSugarDtx: "bloodSugarDtx",
  hba1c: "hba1c",
};

const emptyBaselineImportValues: BaselineImportValues = {
  weight: null,
  heightCm: null,
  waistCircumference: null,
  bloodSugarDtx: null,
  hba1c: null,
};

const emptyPatientOsmAssignmentPreview: PatientOsmRosterAssignmentPreviewInternal = {
  resolutionStatus: "OSM_NOT_APPLICABLE",
  assignmentStatus: null,
  sourceCaregiverName: null,
  normalizedSourceCaregiverName: null,
  currentOsmUserId: null,
  currentCaregiverDisplayName: null,
  resolvedOsmUserId: null,
  resolvedCandidateDisplayName: null,
  candidates: [],
};

export function getImportNow(dependencies: PatientRosterImportServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Patient import time could not be resolved");
  }

  return copy;
}

export function normalizeImportOptions(options: PatientImportOptions): {
  effectiveDate: string | null;
  importContractVersion: typeof PATIENT_IMPORT_CONTRACT_VERSION;
  classificationReconciliationChoices: readonly PatientImportClassificationReconciliationChoice[];
  osmAssignmentChoices: readonly PatientImportOsmAssignmentChoice[];
} {
  const effectiveDate = options.effectiveDate ?? null;

  if (effectiveDate !== null && !patientBaselineDateOnlySchema.safeParse(effectiveDate).success) {
    throw new ValidationError("วันที่ข้อมูลตั้งต้นไม่ถูกต้อง");
  }

  const importContractVersion = options.importContractVersion ?? PATIENT_IMPORT_CONTRACT_VERSION;

  if (importContractVersion !== PATIENT_IMPORT_CONTRACT_VERSION) {
    throw new ValidationError("เวอร์ชันการนำเข้าไม่ถูกต้อง");
  }

  const parsedChoices = z
    .array(patientImportClassificationReconciliationSchema)
    .max(500)
    .safeParse(options.classificationReconciliationChoices ?? []);

  if (!parsedChoices.success) {
    throw new ValidationError("การยืนยันเปลี่ยนสถานะผู้ป่วยไม่ถูกต้อง");
  }

  const choices = parsedChoices.data;
  const rowNumbers = new Set<number>();

  for (const choice of choices) {
    if (
      !Number.isSafeInteger(choice.rowNumber) ||
      choice.rowNumber < 1 ||
      choice.rowNumber > 500 ||
      rowNumbers.has(choice.rowNumber) ||
      !patientClassificationTypeSchema.safeParse(choice.currentClassification).success ||
      !patientClassificationTypeSchema.safeParse(choice.sourceClassification).success ||
      choice.currentClassification === choice.sourceClassification
    ) {
      throw new ValidationError("การยืนยันเปลี่ยนสถานะผู้ป่วยไม่ถูกต้อง");
    }

    rowNumbers.add(choice.rowNumber);
  }

  const parsedOsmChoices = z
    .array(patientImportOsmAssignmentChoiceSchema)
    .max(500)
    .safeParse(options.osmAssignmentChoices ?? []);

  if (!parsedOsmChoices.success) {
    throw new ValidationError("การยืนยันผู้ดูแลจากไฟล์ไม่ถูกต้อง");
  }

  const osmRowNumbers = new Set<number>();

  for (const choice of parsedOsmChoices.data) {
    if (
      osmRowNumbers.has(choice.rowNumber) ||
      normalizeRosterOsmCaregiverName(choice.sourceCaregiverName) !==
        choice.normalizedSourceCaregiverName
    ) {
      throw new ValidationError("การยืนยันผู้ดูแลจากไฟล์ไม่ถูกต้อง");
    }

    osmRowNumbers.add(choice.rowNumber);
  }

  return {
    effectiveDate,
    importContractVersion,
    classificationReconciliationChoices: choices,
    osmAssignmentChoices: parsedOsmChoices.data,
  };
}

function hasBaselineSourceAssertion(
  candidate: PatientProvisioningImportCandidate,
  field: PatientImportBaselineFieldKey,
  value: number | null,
): boolean {
  const assessment = candidate.canonicalRow.fieldAssessments[field];
  return value !== null || assessment.diagnostics.length > 0;
}

export function readBaselineImportState(
  candidate: PatientProvisioningImportCandidate,
  effectiveDate: string | null,
): BaselineImportState {
  const clinical = candidate.canonicalRow.clinicalCandidates;
  const values = { ...emptyBaselineImportValues };
  const presentFields: BaselineImportTargetField[] = [];
  let invalid = false;

  for (const sourceField of PATIENT_IMPORT_BASELINE_FIELD_KEYS) {
    const targetField = baselineImportFieldMap[sourceField];
    const value = clinical[sourceField];

    if (!hasBaselineSourceAssertion(candidate, sourceField, value)) {
      continue;
    }

    if (
      (sourceField === "height" && clinical.heightUnit !== "cm") ||
      candidate.canonicalRow.fieldAssessments[sourceField].diagnostics.length > 0 ||
      value === null ||
      !patientBaselineMeasurementSchema.safeParse(value).success
    ) {
      invalid = true;
      continue;
    }

    values[targetField] = value;
    presentFields.push(targetField);
  }

  if (invalid) {
    return { status: "BASELINE_DATA_INVALID", effectiveDate, presentFields, values };
  }

  if (presentFields.length === 0) {
    return { status: "NOT_APPLICABLE", effectiveDate, presentFields, values };
  }

  if (effectiveDate === null) {
    return { status: "BASELINE_DATE_REQUIRED", effectiveDate, presentFields, values };
  }

  return { status: "BASELINE_READY", effectiveDate, presentFields, values };
}

export function baselineImportMatchesExisting(
  state: BaselineImportState,
  existing: PreviewBaseline,
): boolean {
  if (state.status !== "BASELINE_READY" || state.effectiveDate === null) {
    return false;
  }

  if (existing.recordedOn.getTime() !== dateOnlyToUtcDate(state.effectiveDate).getTime()) {
    return false;
  }

  return state.presentFields.every((field) => existing[field] === state.values[field]);
}

export function baselineImportReason(status: PatientImportBaselineStatus): string | null {
  switch (status) {
    case "BASELINE_READY":
      return "ข้อมูลตั้งต้นพร้อมบันทึกตามวันที่ที่เลือก";
    case "BASELINE_ALREADY_EXISTS":
      return "ข้อมูลตั้งต้นชุดเดียวกันมีอยู่แล้ว ระบบจะไม่สร้างซ้ำ";
    case "BASELINE_CONFLICT":
      return "ข้อมูลตั้งต้นจากไฟล์ขัดแย้งกับข้อมูลที่บันทึกไว้แล้ว ต้องตรวจสอบก่อนนำเข้า";
    case "BASELINE_DATE_REQUIRED":
      return "ต้องระบุวันที่ข้อมูลตั้งต้นก่อนยืนยันนำเข้า";
    case "BASELINE_DATA_INVALID":
      return "ข้อมูลตั้งต้นบางรายการไม่ถูกต้องหรือไม่รองรับหน่วยที่ระบุ";
    default:
      return null;
  }
}

function hasClassificationSourceAssertion(
  candidate: PatientProvisioningImportCandidate,
): boolean {
  const value = candidate.canonicalRow.clinicalCandidates.diabetesClassification;
  const assessment = candidate.canonicalRow.fieldAssessments.diabetesClassification;

  return value !== null || assessment.diagnostics.length > 0;
}

export function readPatientClassificationImportState(
  candidate: PatientProvisioningImportCandidate,
  currentClassification: PatientClassificationType | null,
): PatientImportClassificationPreview {
  if (!hasClassificationSourceAssertion(candidate)) {
    return {
      status: "NOT_APPLICABLE",
      currentClassification,
      sourceClassification: null,
    };
  }

  const sourceClassification = candidate.canonicalRow.clinicalCandidates.diabetesClassification;
  const assessment = candidate.canonicalRow.fieldAssessments.diabetesClassification;
  const parsedSourceClassification = patientClassificationTypeSchema.safeParse(sourceClassification);

  if (
    sourceClassification === null ||
    !parsedSourceClassification.success ||
    assessment.diagnostics.length > 0
  ) {
    return {
      status: "CLASSIFICATION_DATA_INVALID",
      currentClassification,
      sourceClassification: null,
    };
  }

  const normalizedSourceClassification = parsedSourceClassification.data;

  if (currentClassification === null) {
    return {
      status: "CLASSIFICATION_READY",
      currentClassification,
      sourceClassification: normalizedSourceClassification,
    };
  }

  if (currentClassification === normalizedSourceClassification) {
    return {
      status: "CLASSIFICATION_ALREADY_EXISTS",
      currentClassification,
      sourceClassification: normalizedSourceClassification,
    };
  }

  return {
    status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
    currentClassification,
    sourceClassification: normalizedSourceClassification,
  };
}

export function classificationImportReason(
  state: PatientImportClassificationPreview,
): string | null {
  switch (state.status) {
    case "CLASSIFICATION_READY":
      return "สถานะผู้ป่วยจากไฟล์พร้อมบันทึก";
    case "CLASSIFICATION_ALREADY_EXISTS":
      return "สถานะผู้ป่วยตรงกับข้อมูลปัจจุบัน ระบบจะไม่สร้างประวัติซ้ำ";
    case "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION":
      return "สถานะผู้ป่วยจากไฟล์แตกต่างจากสถานะปัจจุบัน ต้องยืนยันการเปลี่ยนแปลงโดยชัดเจน";
    case "CLASSIFICATION_DATA_INVALID":
      return "สถานะผู้ป่วยจากไฟล์ไม่ใช่ค่าที่รองรับ";
    default:
      return null;
  }
}

export function buildBaselineCreateInput(
  relationshipId: string,
  state: BaselineImportState,
): PatientBaselineCreateRequest {
  if (state.status !== "BASELINE_READY" || state.effectiveDate === null) {
    throw new ValidationError("ข้อมูลตั้งต้นของแถวนี้ไม่พร้อมบันทึก");
  }

  const parsed = patientBaselineCreateRequestSchema.safeParse({
    patientHospitalRelationshipId: relationshipId,
    recordedOn: state.effectiveDate,
    ...state.values,
  });

  if (!parsed.success) {
    throw new ValidationError("ข้อมูลตั้งต้นของแถวนี้ไม่ถูกต้อง");
  }

  return parsed.data;
}

function hasNameConflict(
  person: Pick<PreviewPerson, "givenName" | "familyName">,
  input: NonNullable<PatientProvisioningImportCandidate["input"]>,
): boolean {
  return Boolean(
    (person.givenName && person.givenName !== input.givenName) ||
      (person.familyName && person.familyName !== input.familyName),
  );
}

export function classifyExistingPatient(
  existing: PreviewPerson,
  input: NonNullable<PatientProvisioningImportCandidate["input"]>,
): { classification: PatientImportClassification; reason: string | null } {
  if (hasNameConflict(existing, input)) {
    return {
      classification: "CONFLICT",
      reason: "ข้อมูลชื่อของบุคคลเดิมไม่ตรงกัน ต้องตรวจสอบโดยผู้ดูแล",
    };
  }

  if (existing.user) {
    try {
      patientProvisioningTransactionInternals.assertReusableUser(existing.user);
    } catch {
      return {
        classification: "CONFLICT",
        reason: "บัญชีเดิมอยู่ในสถานะที่ต้องตรวจสอบก่อนใช้งาน",
      };
    }
  }

  const relationship = existing.patientProfile?.hospitalRelationships[0];

  if (
    relationship?.hospitalNumber &&
    input.hospitalNumber &&
    relationship.hospitalNumber !== input.hospitalNumber
  ) {
    return {
      classification: "CONFLICT",
      reason: "HN ของความสัมพันธ์กับโรงพยาบาลนี้ไม่ตรงกัน",
    };
  }

  const hasPatientRole = existing.user?.roles.some(({ role }) => role === Role.PATIENT) ?? false;

  if (relationship && hasPatientRole) {
    return { classification: "ALREADY_EXISTS", reason: "มีข้อมูลผู้ป่วยและความสัมพันธ์นี้แล้ว" };
  }

  return { classification: "READY", reason: "พร้อมบันทึกข้อมูลผู้ป่วย" };
}

function toPreviewRow(
  candidate: PatientProvisioningImportCandidate,
  classification: PatientImportClassification,
  reason: string | null,
  baselineStatus: PatientImportBaselineStatus = "NOT_APPLICABLE",
  patientClassification: PatientImportClassificationPreview = {
    status: "NOT_APPLICABLE",
    currentClassification: null,
    sourceClassification: null,
  },
  patientOsmAssignment: PatientOsmRosterAssignmentPreviewInternal =
    emptyPatientOsmAssignmentPreview,
): PatientImportPreviewRowInternal {
  const requirementGatedFields = PATIENT_IMPORT_FIELD_KEYS.filter((field) => {
    if (
      field === "nationalId" ||
      field === "givenName" ||
      field === "familyName" ||
      field === "hospitalNumber"
    ) {
      return false;
    }

    if (
      isPatientImportBaselineField(field) ||
      isPatientImportClassificationField(field) ||
      isPatientImportOsmAssignmentField(field)
    ) {
      return false;
    }

    const assessment = candidate.canonicalRow.fieldAssessments[field];
    return assessment.present && assessment.status !== "NOT_PRESENT";
  });

  const diagnosticCodes = [...new Set(candidate.canonicalRow.diagnostics.map(({ code }) => code))];

  return {
    rowNumber: candidate.rowNumber,
    identityDisplay: candidate.identityDisplay,
    givenName: candidate.givenName,
    familyName: candidate.familyName,
    combinedNameText: candidate.combinedNameText,
    hospitalNumber: candidate.hospitalNumber,
    classification,
    reason:
      reason ??
      classificationImportReason(patientClassification) ??
      (requirementGatedFields.length > 0
        ? "ข้อมูลหลักพร้อมนำเข้า แต่ข้อมูลเพิ่มเติมบางรายการยังไม่บันทึกในระยะนี้"
        : baselineImportReason(baselineStatus)),
    baselineStatus,
    requirementGatedFields,
    diagnosticCodes,
    patientClassification,
    patientOsmAssignment,
  };
}

export function toPublicPatientOsmAssignmentPreview(
  preview: PatientOsmRosterAssignmentPreviewInternal,
): PatientImportOsmAssignmentPreview {
  return {
    resolutionStatus: preview.resolutionStatus,
    assignmentStatus: preview.assignmentStatus,
    sourceCaregiverName: preview.sourceCaregiverName,
    currentCaregiver: preview.currentCaregiverDisplayName
      ? { displayName: preview.currentCaregiverDisplayName }
      : null,
    resolvedCandidate: preview.resolvedCandidateDisplayName
      ? { displayName: preview.resolvedCandidateDisplayName }
      : null,
    candidates:
      preview.resolutionStatus === "OSM_MATCHED"
        ? preview.candidates.map(({ displayName }) => ({ displayName }))
        : [],
  };
}

export function projectPatientRosterImportPreview(
  preview: PatientImportPreviewInternal,
): PatientImportPreview {
  return {
    ...preview,
    rows: preview.rows.map((row) => ({
      ...row,
      patientOsmAssignment: toPublicPatientOsmAssignmentPreview(row.patientOsmAssignment),
    })),
  };
}

export function applyPatientOsmPreviewState(
  baselineClassification: {
    classification: PatientImportClassification;
    reason: string | null;
  },
  patientOsmAssignment: PatientOsmRosterAssignmentPreviewInternal,
): {
  classification: PatientImportClassification;
  reason: string | null;
} {
  if (
    baselineClassification.classification === "INVALID" ||
    baselineClassification.classification === "CONFLICT" ||
    baselineClassification.classification === "DUPLICATE_IN_FILE" ||
    baselineClassification.classification === "HOSPITAL_MISMATCH"
  ) {
    return baselineClassification;
  }

  const resolutionReason =
    patientOsmAssignment.resolutionStatus === "OSM_NOT_FOUND"
      ? "ไม่พบ อสม./โค้ชที่ตรงกับชื่อในโรงพยาบาลนี้ ต้องตรวจสอบก่อนนำเข้า"
      : patientOsmAssignment.resolutionStatus === "OSM_AMBIGUOUS"
        ? "พบผู้ดูแลชื่อเดียวกันมากกว่า 1 คน และยังไม่มีข้อมูลเพียงพอที่จะระบุผู้ดูแลที่ถูกต้อง"
        : patientOsmAssignment.resolutionStatus === "OSM_SELF_ASSIGNMENT_FORBIDDEN"
          ? "ไม่สามารถกำหนดตนเองเป็นผู้ดูแลผู้ป่วยได้"
          : patientOsmAssignment.resolutionStatus === "OSM_DATA_INVALID"
            ? "ชื่อผู้ดูแลจากไฟล์ไม่ถูกต้อง ต้องตรวจสอบก่อนนำเข้า"
            : patientOsmAssignment.assignmentStatus === "OSM_ASSIGNMENT_CONFLICT"
              ? "ผู้ดูแลปัจจุบันแตกต่างจากไฟล์ ต้องยืนยันการเปลี่ยนแปลงโดยเจ้าของโรงพยาบาล"
              : patientOsmAssignment.assignmentStatus === "OSM_OWNER_REQUIRED"
                ? "การกำหนดหรือเปลี่ยนผู้ดูแลจากไฟล์ต้องดำเนินการโดยเจ้าของโรงพยาบาล"
                : null;

  const isBlocking =
    patientOsmAssignment.resolutionStatus === "OSM_NOT_FOUND" ||
    patientOsmAssignment.resolutionStatus === "OSM_AMBIGUOUS" ||
    patientOsmAssignment.resolutionStatus === "OSM_SELF_ASSIGNMENT_FORBIDDEN" ||
    patientOsmAssignment.resolutionStatus === "OSM_DATA_INVALID" ||
    patientOsmAssignment.assignmentStatus === "OSM_ASSIGNMENT_CONFLICT" ||
    patientOsmAssignment.assignmentStatus === "OSM_OWNER_REQUIRED";

  return isBlocking
    ? {
        classification:
          patientOsmAssignment.resolutionStatus === "OSM_DATA_INVALID"
            ? "INVALID"
            : "NEEDS_REVIEW",
        reason: resolutionReason,
      }
    : baselineClassification;
}

export function hasHospitalTextMismatch(
  candidate: PatientProvisioningImportCandidate,
  targetHospitalName: string,
): boolean {
  const sourceHospitalName = candidate.canonicalRow.organizationCandidates.hospitalName;

  if (!sourceHospitalName) {
    return false;
  }

  return (
    normalizePatientImportOrganizationText(sourceHospitalName) !==
    normalizePatientImportOrganizationText(targetHospitalName)
  );
}

export function applyBaselinePreviewState(
  coreClassification: PatientImportClassification,
  coreReason: string | null,
  baselineState: BaselineImportState,
  existingBaseline: PreviewBaseline | null,
): {
  classification: PatientImportClassification;
  reason: string | null;
  baselineStatus: PatientImportBaselineStatus;
} {
  if (baselineState.status === "NOT_APPLICABLE") {
    return {
      classification: coreClassification,
      reason: coreReason,
      baselineStatus: baselineState.status,
    };
  }

  if (
    baselineState.status === "BASELINE_DATA_INVALID" ||
    baselineState.status === "BASELINE_DATE_REQUIRED"
  ) {
    return {
      classification: coreClassification === "CONFLICT" ? coreClassification : "INVALID",
      reason:
        coreClassification === "CONFLICT"
          ? coreReason
          : baselineImportReason(baselineState.status),
      baselineStatus: baselineState.status,
    };
  }

  if (!existingBaseline) {
    return {
      classification: coreClassification === "ALREADY_EXISTS" ? "READY" : coreClassification,
      reason:
        coreClassification === "ALREADY_EXISTS"
          ? "ผู้ป่วยมีข้อมูลอยู่แล้ว แต่พร้อมบันทึกข้อมูลตั้งต้น"
          : coreReason,
      baselineStatus: baselineState.status,
    };
  }

  if (baselineImportMatchesExisting(baselineState, existingBaseline)) {
    return {
      classification: coreClassification === "CONFLICT" ? coreClassification : "ALREADY_EXISTS",
      reason:
        coreClassification === "CONFLICT"
          ? coreReason
          : baselineImportReason("BASELINE_ALREADY_EXISTS"),
      baselineStatus: "BASELINE_ALREADY_EXISTS",
    };
  }

  return {
    classification: coreClassification === "CONFLICT" ? coreClassification : "CONFLICT",
    reason:
      coreClassification === "CONFLICT"
        ? coreReason
        : baselineImportReason("BASELINE_CONFLICT"),
    baselineStatus: "BASELINE_CONFLICT",
  };
}

export function applyPatientClassificationPreviewState(
  baselinePreview: {
    classification: PatientImportClassification;
    reason: string | null;
    baselineStatus: PatientImportBaselineStatus;
  },
  patientClassification: PatientImportClassificationPreview,
): {
  classification: PatientImportClassification;
  reason: string | null;
} {
  if (
    baselinePreview.classification === "CONFLICT" ||
    baselinePreview.classification === "DUPLICATE_IN_FILE" ||
    baselinePreview.classification === "HOSPITAL_MISMATCH"
  ) {
    return baselinePreview;
  }

  if (patientClassification.status === "CLASSIFICATION_DATA_INVALID") {
    return {
      ...baselinePreview,
      classification: "INVALID",
      reason: classificationImportReason(patientClassification),
    };
  }

  if (patientClassification.status === "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION") {
    return {
      ...baselinePreview,
      classification: "NEEDS_REVIEW",
      reason: classificationImportReason(patientClassification),
    };
  }

  return baselinePreview;
}

export function normalizeImportCandidates(
  candidates: readonly PatientProvisioningImportCandidate[],
  targetHospitalId: string,
): PatientProvisioningImportCandidate[] {
  return candidates.map((candidate) => {
    if (!candidate.input) {
      return candidate;
    }

    const parsed = patientProvisionInputSchema.safeParse(candidate.input);

    if (!parsed.success) {
      return {
        ...candidate,
        input: null,
        validationMessage: "ข้อมูลแถวนี้ไม่ถูกต้อง",
      };
    }

    if (parsed.data.targetHospitalId !== targetHospitalId) {
      return {
        ...candidate,
        input: null,
        validationMessage: "แถวนี้อยู่นอกขอบเขตโรงพยาบาลที่เลือก",
      };
    }

    return {
      ...candidate,
      input: parsed.data,
      givenName: parsed.data.givenName,
      familyName: parsed.data.familyName,
      hospitalNumber: parsed.data.hospitalNumber ?? null,
      validationMessage: null,
    };
  });
}

export function validateRosterImportTarget(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
): string {
  const parsedScope = patientProvisionScopeSchema.safeParse({ targetHospitalId });

  if (!parsedScope.success) {
    throw new ValidationError("Patient import Hospital scope is invalid");
  }

  assertPatientBulkProvisioningPolicy({
    actor,
    capability: PATIENT_PROVISIONING_CAPABILITY,
    targetHospitalId: parsedScope.data.targetHospitalId,
  });

  if (!actor) {
    throw new ForbiddenError();
  }

  return parsedScope.data.targetHospitalId;
}

export function buildEligibleOsmCandidateIndex(
  candidates: readonly PatientOsmRosterCandidate[],
): Map<string, PatientOsmRosterCandidate[]> {
  const candidatesByName = new Map<string, PatientOsmRosterCandidate[]>();

  for (const candidate of candidates) {
    const normalizedDisplayName = normalizeRosterOsmCaregiverName(candidate.displayName);

    if (!normalizedDisplayName) {
      continue;
    }

    const candidatesForName = candidatesByName.get(normalizedDisplayName);

    if (candidatesForName) {
      candidatesForName.push(candidate);
    } else {
      candidatesByName.set(normalizedDisplayName, [candidate]);
    }
  }

  return candidatesByName;
}

export function buildPatientOsmAssignmentPreview(
  candidate: PatientProvisioningImportCandidate,
  existingRelationship: PreviewRelationship | undefined,
  eligibleOsmCandidatesByName: ReadonlyMap<string, readonly PatientOsmRosterCandidate[]>,
  actor: ActorContext,
  targetHospitalId: string,
): PatientOsmRosterAssignmentPreviewInternal {
  const currentAssignment = existingRelationship?.osmAssignments[0]
    ? {
        osmUserId: existingRelationship.osmAssignments[0].osmUserId,
        displayName: formatPatientOsmDisplayName(
          existingRelationship.osmAssignments[0].osmUser.person,
        ),
      }
    : null;
  const normalizedSourceCaregiverName = normalizeRosterOsmCaregiverName(
    candidate.canonicalRow.caregiverCandidates.osmCaregiverName,
  );

  return buildRosterOsmAssignmentPreview({
    sourceCaregiverName: candidate.canonicalRow.caregiverCandidates.osmCaregiverName,
    sourceDiagnostics: candidate.canonicalRow.fieldAssessments.osmCaregiverName.diagnostics,
    currentAssignment,
    candidates: normalizedSourceCaregiverName
      ? eligibleOsmCandidatesByName.get(normalizedSourceCaregiverName) ?? []
      : [],
    actor,
    targetHospitalId,
  });
}

export function composePatientRosterPreviewRow(input: {
  candidate: PatientProvisioningImportCandidate;
  hash: string | undefined;
  duplicateCount: number;
  existing: PreviewPerson | undefined;
  targetHospitalName: string;
  eligibleOsmCandidatesByName: ReadonlyMap<string, readonly PatientOsmRosterCandidate[]>;
  actor: ActorContext;
  targetHospitalId: string;
  effectiveDate: string | null;
}): PatientImportPreviewRowInternal {
  const existingRelationship = input.existing?.patientProfile?.hospitalRelationships[0];
  const patientOsmAssignment = buildPatientOsmAssignmentPreview(
    input.candidate,
    existingRelationship,
    input.eligibleOsmCandidatesByName,
    input.actor,
    input.targetHospitalId,
  );

  if (!input.candidate.input) {
    return toPreviewRow(
      input.candidate,
      "INVALID",
      input.candidate.validationMessage,
      "NOT_APPLICABLE",
      undefined,
      patientOsmAssignment,
    );
  }

  if (hasHospitalTextMismatch(input.candidate, input.targetHospitalName)) {
    return toPreviewRow(
      input.candidate,
      "HOSPITAL_MISMATCH",
      "ชื่อโรงพยาบาลในไฟล์ไม่ตรงกับโรงพยาบาลที่เลือก ต้องตรวจสอบก่อนนำเข้า",
      "NOT_APPLICABLE",
      undefined,
      patientOsmAssignment,
    );
  }

  if (input.hash && input.duplicateCount > 1) {
    return toPreviewRow(
      input.candidate,
      "DUPLICATE_IN_FILE",
      "พบเลขบัตรประชาชนซ้ำในไฟล์เดียวกัน",
      "NOT_APPLICABLE",
      undefined,
      patientOsmAssignment,
    );
  }

  const coreClassification = input.existing
    ? classifyExistingPatient(input.existing, input.candidate.input)
    : { classification: "READY" as const, reason: "พร้อมบันทึกข้อมูลผู้ป่วย" };
  const patientClassification = readPatientClassificationImportState(
    input.candidate,
    input.existing?.patientProfile?.patientClassification?.classification ?? null,
  );
  const baselineState = readBaselineImportState(input.candidate, input.effectiveDate);
  const baselinePreview = applyBaselinePreviewState(
    coreClassification.classification,
    coreClassification.reason,
    baselineState,
    existingRelationship?.baseline ?? null,
  );
  const classificationPreview = applyPatientClassificationPreviewState(
    baselinePreview,
    patientClassification,
  );
  const osmPreview = applyPatientOsmPreviewState(
    classificationPreview,
    patientOsmAssignment,
  );

  return toPreviewRow(
    input.candidate,
    osmPreview.classification,
    osmPreview.reason,
    baselinePreview.baselineStatus,
    patientClassification,
    patientOsmAssignment,
  );
}

export async function preparePatientRosterImportPreview(
  actor: ActorContext,
  targetHospitalId: string,
  normalizedCandidates: readonly PatientProvisioningImportCandidate[],
  database: PatientRosterImportDatabase,
  normalizedOptions: {
    effectiveDate: string | null;
    importContractVersion: typeof PATIENT_IMPORT_CONTRACT_VERSION;
    classificationReconciliationChoices: readonly PatientImportClassificationReconciliationChoice[];
    osmAssignmentChoices: readonly PatientImportOsmAssignmentChoice[];
  },
): Promise<PatientImportPreviewInternal> {
  try {
    await assertPatientProvisioningActorInDatabase(
      database,
      actor.userId,
      targetHospitalId,
      "BULK",
    );
    const targetHospital = await database.hospital.findUnique({
      where: { id: targetHospitalId },
      select: { name: true },
    });

    if (!targetHospital) {
      throw new ForbiddenError();
    }

    const hashByRow = new Map<number, string>();
    const counts = new Map<string, number>();

    for (const candidate of normalizedCandidates) {
      if (!candidate.input) {
        continue;
      }

      const hash = hashIdentityReference(candidate.input.identity);
      hashByRow.set(candidate.rowNumber, hash);
      counts.set(hash, (counts.get(hash) ?? 0) + 1);
    }

    const hashes = [...counts.keys()];
    const people = hashes.length
      ? await database.person.findMany({
          where: { identityKeyHash: { in: hashes } },
          select: {
            id: true,
            identityKeyHash: true,
            givenName: true,
            familyName: true,
            user: {
              select: {
                id: true,
                status: true,
                authSubject: true,
                roles: { select: { role: true } },
              },
            },
            patientProfile: {
              select: {
                id: true,
                patientClassification: {
                  select: { classification: true },
                },
                hospitalRelationships: {
                  where: { hospitalId: targetHospitalId },
                  select: {
                    id: true,
                    hospitalNumber: true,
                    baseline: {
                      select: {
                        recordedOn: true,
                        weight: true,
                        heightCm: true,
                        waistCircumference: true,
                        bloodSugarDtx: true,
                        hba1c: true,
                      },
                    },
                    osmAssignments: {
                      where: { endedAt: null },
                      take: 1,
                      select: {
                        osmUserId: true,
                        osmUser: {
                          select: {
                            person: {
                              select: {
                                givenName: true,
                                familyName: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : [];
    const existingByHash = new Map<string, PreviewPerson>(
      people.map((person) => [person.identityKeyHash, person]),
    );

    const hasOsmSourceAssertion = normalizedCandidates.some((candidate) => {
      const sourceName = candidate.canonicalRow.caregiverCandidates.osmCaregiverName;
      const diagnostics = candidate.canonicalRow.fieldAssessments.osmCaregiverName.diagnostics;

      return sourceName !== null || diagnostics.length > 0;
    });
    const eligibleOsmCandidates = hasOsmSourceAssertion
      ? await listEligibleRosterOsmCandidates(database, targetHospitalId)
      : [];
    const eligibleOsmCandidatesByName = buildEligibleOsmCandidateIndex(eligibleOsmCandidates);
    const canManageOsmAssignment = decidePatientOsmAssignmentPolicy({
      actor,
      capability: PATIENT_ASSIGN_OSM_CAPABILITY,
      targetHospitalId,
    }).allowed;

    const rows = normalizedCandidates.map((candidate) => {
      const hash = hashByRow.get(candidate.rowNumber);

      return composePatientRosterPreviewRow({
        candidate,
        hash,
        duplicateCount: hash ? counts.get(hash) ?? 0 : 0,
        existing: hash ? existingByHash.get(hash) : undefined,
        targetHospitalName: targetHospital.name,
        eligibleOsmCandidatesByName,
        actor,
        targetHospitalId,
        effectiveDate: normalizedOptions.effectiveDate,
      });
    });

    const classificationReconciliations = rows.flatMap((row) =>
      row.patientClassification.status === "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION" &&
      row.patientClassification.currentClassification &&
      row.patientClassification.sourceClassification
        ? [{
            rowNumber: row.rowNumber,
            currentClassification: row.patientClassification.currentClassification,
            sourceClassification: row.patientClassification.sourceClassification,
          }]
        : [],
    );

    return {
      targetHospitalId,
      effectiveDate: normalizedOptions.effectiveDate,
      importContractVersion: normalizedOptions.importContractVersion,
      baselineDateRequired: rows.some(
        ({ baselineStatus }) => baselineStatus === "BASELINE_DATE_REQUIRED",
      ),
      file: normalizedCandidates.find((candidate) => candidate.fileMetadata)?.fileMetadata ?? null,
      rows,
      classificationReconciliations,
      canManageOsmAssignment,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient import preview could not be prepared");
  }
}

export const patientRosterImportPreviewInternals = {
  applyBaselinePreviewState,
  applyPatientClassificationPreviewState,
  applyPatientOsmPreviewState,
  baselineImportMatchesExisting,
  baselineImportReason,
  buildEligibleOsmCandidateIndex,
  buildBaselineCreateInput,
  buildPatientOsmAssignmentPreview,
  classifyExistingPatient,
  classificationImportReason,
  composePatientRosterPreviewRow,
  hasHospitalTextMismatch,
  normalizeImportCandidates,
  normalizeImportOptions,
  readBaselineImportState,
  readPatientClassificationImportState,
  toPublicPatientOsmAssignmentPreview,
};
