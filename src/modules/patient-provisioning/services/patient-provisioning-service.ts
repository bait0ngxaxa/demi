import "server-only";

import {
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import {
  DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
  runSerializableTransaction,
} from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { PATIENT_BASELINE_CREATE_CAPABILITY } from "@/modules/patient-baseline/policies/patient-baseline-policy";
import {
  dateOnlyToUtcDate,
  patientBaselineCreateRequestSchema,
  patientBaselineDateOnlySchema,
  patientBaselineMeasurementSchema,
  type PatientBaselineCreateRequest,
} from "@/modules/patient-baseline/schemas/patient-baseline-schemas";
import {
  createPatientBaselineInTransaction,
} from "@/modules/patient-baseline/services/patient-baseline-transaction";
import { resolvePatientBaselineAccessContext } from "@/modules/patient-baseline/services/patient-baseline-access-service";
import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";
import { patientClassificationTypeSchema } from "@/modules/patient-classification/schemas/patient-classification-schemas";
import {
  setPatientClassificationInTransaction,
  type PatientClassificationMutationResult,
} from "@/modules/patient-classification/services/patient-classification-transaction";
import {
  hashIdentityReference,
} from "@/modules/identity/services/identity-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  assertPatientBulkProvisioningPolicy,
  assertPatientProvisioningPolicy,
  hasDirectHospitalProvisioningScope,
  hasOsmHospitalProvisioningScope,
  PATIENT_PROVISIONING_CAPABILITY,
  patientProvisioningPolicyInternals,
} from "../policies/patient-provisioning-policy";
import {
  patientProvisionInputSchema,
  patientProvisionScopeSchema,
  patientImportClassificationReconciliationSchema,
  type ProvisionPatientInput,
} from "../schemas/patient-provisioning-schemas";
import {
  normalizePatientImportOrganizationText,
} from "../import/patient-import-layouts";
import type {
  PatientImportDiagnosticCode,
  PatientImportFieldKey,
  PatientImportFileMetadata,
  PatientProvisioningImportCandidate,
} from "../import/patient-import-contract";
import {
  PATIENT_IMPORT_BASELINE_FIELD_KEYS,
  PATIENT_IMPORT_CONTRACT_VERSION,
  PATIENT_IMPORT_FIELD_KEYS,
  isPatientImportBaselineField,
  isPatientImportClassificationField,
  type PatientImportBaselineFieldKey,
} from "../import/patient-import-contract";
import {
  assertPatientProvisioningActorInDatabase,
  PatientProvisioningConflictError,
  patientProvisioningTransactionInternals,
  provisionPatientInTransaction,
  type PatientProvisioningAuthorizationMode,
  type PatientProvisioningResult,
} from "./patient-provisioning-transaction";

export type { ProvisionPatientInput } from "../schemas/patient-provisioning-schemas";
export type { PatientProvisioningImportCandidate } from "../import/patient-import-contract";
export { PatientProvisioningConflictError };
export type {
  PatientProvisioningConflictKind,
  PatientProvisioningOutcome,
  PatientProvisioningResult,
  PatientTransactionDatabase,
} from "./patient-provisioning-transaction";

export type PatientDatabase = PrismaClient;

export type PatientProvisioningServiceDependencies = {
  database?: PatientDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientImportOptions = {
  effectiveDate?: string | null;
  importContractVersion?: string;
  classificationReconciliationChoices?: readonly PatientImportClassificationReconciliationChoice[];
};

export type PatientProvisioningScope = {
  hospitalId: string;
  hospitalCode: string;
  hospitalName: string;
  canBulkImport: boolean;
};

export type PatientImportClassification =
  | "READY"
  | "ALREADY_EXISTS"
  | "DUPLICATE_IN_FILE"
  | "INVALID"
  | "CONFLICT"
  | "NEEDS_REVIEW"
  | "HOSPITAL_MISMATCH"
  | "UNSUPPORTED_REQUIREMENT";

export type PatientImportBaselineStatus =
  | "NOT_APPLICABLE"
  | "BASELINE_READY"
  | "BASELINE_CREATED"
  | "BASELINE_ALREADY_EXISTS"
  | "BASELINE_CONFLICT"
  | "BASELINE_DATE_REQUIRED"
  | "BASELINE_DATA_INVALID";

export type PatientImportClassificationStatus =
  | "NOT_APPLICABLE"
  | "CLASSIFICATION_READY"
  | "CLASSIFICATION_ALREADY_EXISTS"
  | "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION"
  | "CLASSIFICATION_DATA_INVALID";

export type PatientImportClassificationReconciliation = {
  rowNumber: number;
  currentClassification: PatientClassificationType;
  sourceClassification: PatientClassificationType;
};

export type PatientImportClassificationReconciliationChoice =
  PatientImportClassificationReconciliation;

export type PatientImportClassificationPreview = {
  status: PatientImportClassificationStatus;
  currentClassification: PatientClassificationType | null;
  sourceClassification: PatientClassificationType | null;
};

export type PatientImportPreviewRow = {
  rowNumber: number;
  identityDisplay: string;
  givenName: string;
  familyName: string;
  combinedNameText: string | null;
  hospitalNumber: string | null;
  classification: PatientImportClassification;
  reason: string | null;
  baselineStatus: PatientImportBaselineStatus;
  requirementGatedFields: readonly PatientImportFieldKey[];
  diagnosticCodes: readonly PatientImportDiagnosticCode[];
  patientClassification: PatientImportClassificationPreview;
};

export type PatientImportPreview = {
  targetHospitalId: string;
  effectiveDate: string | null;
  importContractVersion: typeof PATIENT_IMPORT_CONTRACT_VERSION;
  baselineDateRequired: boolean;
  rows: PatientImportPreviewRow[];
  classificationReconciliations: PatientImportClassificationReconciliation[];
  file: PatientImportFileMetadata | null;
};

export type PatientImportRowResult = PatientImportPreviewRow & {
  result:
    | "IMPORTED"
    | "ALREADY_EXISTS"
    | "DUPLICATE_IN_FILE"
    | "INVALID"
    | "CONFLICT"
    | "NEEDS_REVIEW"
    | "HOSPITAL_MISMATCH"
    | "UNSUPPORTED_REQUIREMENT"
    | "FAILED";
};

export type PatientImportResultSummary = {
  targetHospitalId: string;
  imported: number;
  alreadyExists: number;
  duplicateInFile: number;
  invalid: number;
  conflict: number;
  needsReview: number;
  hospitalMismatch: number;
  unsupportedRequirement: number;
  failed: number;
  baselineCreated: number;
  baselineAlreadyExists: number;
  baselineConflict: number;
  baselineInvalid: number;
  baselineDateRequired: number;
  classificationCreated: number;
  classificationAlreadyExists: number;
  classificationChanged: number;
  classificationNeedsReview: number;
  classificationInvalid: number;
  rows: PatientImportRowResult[];
  file: PatientImportFileMetadata | null;
};

function getDatabase(dependencies: PatientProvisioningServiceDependencies): PatientDatabase {
  return dependencies.database ?? getPrisma();
}

function getImportNow(dependencies: PatientProvisioningServiceDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("Patient import time could not be resolved");
  }

  return copy;
}

function normalizeImportOptions(options: PatientImportOptions): {
  effectiveDate: string | null;
  importContractVersion: typeof PATIENT_IMPORT_CONTRACT_VERSION;
  classificationReconciliationChoices: readonly PatientImportClassificationReconciliationChoice[];
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

  return {
    effectiveDate,
    importContractVersion,
    classificationReconciliationChoices: choices,
  };
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function normalizeDatabaseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002")) {
    return new PatientProvisioningConflictError(
      "RECONCILIATION_REQUIRED",
      "Patient provisioning conflicted with another request",
    );
  }

  if (isKnownRequestError(error, "P2034")) {
    return new PatientProvisioningConflictError(
      "RECONCILIATION_REQUIRED",
      "Patient provisioning conflicted with another request",
    );
  }

  return new InfrastructureError("Patient provisioning could not be completed");
}

async function provisionPatientWithAuthorizationMode(
  actor: ActorContext | null | undefined,
  input: ProvisionPatientInput,
  dependencies: PatientProvisioningServiceDependencies = {},
  authorizationMode: PatientProvisioningAuthorizationMode,
): Promise<PatientProvisioningResult> {
  const parsed = patientProvisionInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient provisioning data is invalid");
  }

  if (authorizationMode === "BULK") {
    assertPatientBulkProvisioningPolicy({
      actor,
      capability: PATIENT_PROVISIONING_CAPABILITY,
      targetHospitalId: parsed.data.targetHospitalId,
    });
  } else {
    assertPatientProvisioningPolicy({
      actor,
      capability: PATIENT_PROVISIONING_CAPABILITY,
      targetHospitalId: parsed.data.targetHospitalId,
    });
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const result = await runSerializableTransaction(
      getDatabase(dependencies),
      (transaction) =>
        provisionPatientInTransaction(
          transaction,
          actor,
          parsed.data,
          authorizationMode,
        ),
      dependencies.transactionRetries ?? DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
    );

    return result;
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function provisionPatient(
  actor: ActorContext | null | undefined,
  input: ProvisionPatientInput,
  dependencies: PatientProvisioningServiceDependencies = {},
): Promise<PatientProvisioningResult> {
  return provisionPatientWithAuthorizationMode(actor, input, dependencies, "SINGLE");
}

export async function listPatientProvisioningScopes(
  actor: ActorContext | null | undefined,
  database: PatientDatabase = getPrisma(),
): Promise<PatientProvisioningScope[]> {
  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const currentActor = await database.user.findUnique({
      where: { id: actor.userId },
      select: {
        status: true,
        roles: { select: { role: true } },
        memberships: {
          select: {
            hospitalId: true,
            membershipType: true,
            status: true,
            hospital: { select: { hospitalCode: true, name: true, status: true } },
          },
        },
        osmHospitalRelationships: {
          select: {
            hospitalId: true,
            status: true,
            hospital: { select: { hospitalCode: true, name: true, status: true } },
          },
        },
      },
    });

    if (!currentActor || currentActor.status !== UserStatus.ACTIVE) {
      throw new ForbiddenError();
    }

    const roles = new Set(currentActor.roles.map(({ role }) => role));
    const scopes = new Map<string, PatientProvisioningScope>();

    if (roles.has(Role.HOSPITAL)) {
      for (const membership of currentActor.memberships) {
        if (
          !patientProvisioningPolicyInternals.isActiveDirectHospitalScope({
            membershipType: membership.membershipType,
            status: membership.status,
            hospitalStatus: membership.hospital.status,
          })
        ) {
          continue;
        }

        scopes.set(membership.hospitalId, {
          hospitalId: membership.hospitalId,
          hospitalCode: membership.hospital.hospitalCode,
          hospitalName: membership.hospital.name,
          canBulkImport: true,
        });
      }
    }

    if (roles.has(Role.OSM)) {
      for (const relationship of currentActor.osmHospitalRelationships) {
        if (
          !patientProvisioningPolicyInternals.isActiveOsmHospitalScope({
            status: relationship.status,
            hospitalStatus: relationship.hospital.status,
          })
        ) {
          continue;
        }

        const existing = scopes.get(relationship.hospitalId);
        scopes.set(relationship.hospitalId, {
          hospitalId: relationship.hospitalId,
          hospitalCode: relationship.hospital.hospitalCode,
          hospitalName: relationship.hospital.name,
          canBulkImport: existing?.canBulkImport ?? false,
        });
      }
    }

    return [...scopes.values()].sort((left, right) =>
      `${left.hospitalName}\u0000${left.hospitalCode}`.localeCompare(
        `${right.hospitalName}\u0000${right.hospitalCode}`,
        "th",
      ),
    );
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient provisioning scope could not be loaded");
  }
}

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

const baselineImportFieldMap: Readonly<Record<PatientImportBaselineFieldKey, BaselineImportTargetField>> = {
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

export class PatientBaselineImportConflictError extends ConflictError {
  constructor() {
    super("ข้อมูลตั้งต้นจากไฟล์ขัดแย้งกับข้อมูลที่บันทึกไว้แล้ว");
    this.name = "PatientBaselineImportConflictError";
  }
}

function hasBaselineSourceAssertion(
  candidate: PatientProvisioningImportCandidate,
  field: PatientImportBaselineFieldKey,
  value: number | null,
): boolean {
  const assessment = candidate.canonicalRow.fieldAssessments[field];
  return value !== null || assessment.diagnostics.length > 0;
}

function readBaselineImportState(
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
    return {
      status: "BASELINE_DATA_INVALID",
      effectiveDate,
      presentFields,
      values,
    };
  }

  if (presentFields.length === 0) {
    return {
      status: "NOT_APPLICABLE",
      effectiveDate,
      presentFields,
      values,
    };
  }

  if (effectiveDate === null) {
    return {
      status: "BASELINE_DATE_REQUIRED",
      effectiveDate,
      presentFields,
      values,
    };
  }

  return {
    status: "BASELINE_READY",
    effectiveDate,
    presentFields,
    values,
  };
}

function baselineImportMatchesExisting(
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

function baselineImportReason(status: PatientImportBaselineStatus): string | null {
  switch (status) {
    case "BASELINE_READY":
      return "ข้อมูลตั้งต้นพร้อมบันทึกตามวันที่ที่เลือก";
    case "BASELINE_ALREADY_EXISTS":
      return "ข้อมูลตั้งต้นชุดเดียวกันมีอยู่แล้ว ระบบจะไม่สร้างซ้ำ";
    case "BASELINE_CONFLICT":
      return "ข้อมูลตั้งต้นจากไฟล์ขัดแย้งกับข้อมูลเดิม ต้องตรวจสอบก่อนนำเข้า";
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

function readPatientClassificationImportState(
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

function classificationImportReason(
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

function buildBaselineCreateInput(
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
  input: ProvisionPatientInput,
): boolean {
  return Boolean(
    (person.givenName && person.givenName !== input.givenName) ||
      (person.familyName && person.familyName !== input.familyName),
  );
}

function classifyExistingPatient(
  existing: PreviewPerson,
  input: ProvisionPatientInput,
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
): PatientImportPreviewRow {
  const requirementGatedFields = PATIENT_IMPORT_FIELD_KEYS.filter((field) => {
    if (field === "nationalId" || field === "givenName" || field === "familyName" || field === "hospitalNumber") {
      return false;
    }

    if (isPatientImportBaselineField(field)) {
      return false;
    }

    if (isPatientImportClassificationField(field)) {
      return false;
    }

    const assessment = candidate.canonicalRow.fieldAssessments[field];
    return assessment.present && assessment.status !== "NOT_PRESENT";
  });

  const diagnosticCodes = [
    ...new Set(candidate.canonicalRow.diagnostics.map(({ code }) => code)),
  ];

  return {
    rowNumber: candidate.rowNumber,
    identityDisplay: candidate.identityDisplay,
    givenName: candidate.givenName,
    familyName: candidate.familyName,
    combinedNameText: candidate.combinedNameText,
    hospitalNumber: candidate.hospitalNumber,
    classification,
    reason: reason ?? classificationImportReason(patientClassification) ??
      (requirementGatedFields.length > 0
        ? "ข้อมูลหลักพร้อมนำเข้า แต่ข้อมูลเพิ่มเติมบางรายการยังไม่บันทึกในระยะนี้"
        : baselineImportReason(baselineStatus)),
    baselineStatus,
    requirementGatedFields,
    diagnosticCodes,
    patientClassification,
  };
}

function hasHospitalTextMismatch(
  candidate: PatientProvisioningImportCandidate,
  targetHospitalName: string,
): boolean {
  const sourceHospitalName = candidate.canonicalRow.organizationCandidates.hospitalName;

  if (!sourceHospitalName) {
    return false;
  }

  return normalizePatientImportOrganizationText(sourceHospitalName) !==
    normalizePatientImportOrganizationText(targetHospitalName);
}

function applyBaselinePreviewState(
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

  if (baselineState.status === "BASELINE_DATA_INVALID" || baselineState.status === "BASELINE_DATE_REQUIRED") {
    return {
      classification: coreClassification === "CONFLICT" ? coreClassification : "INVALID",
      reason: coreClassification === "CONFLICT" ? coreReason : baselineImportReason(baselineState.status),
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
      reason: coreClassification === "CONFLICT" ? coreReason : baselineImportReason("BASELINE_ALREADY_EXISTS"),
      baselineStatus: "BASELINE_ALREADY_EXISTS",
    };
  }

  return {
    classification: coreClassification === "CONFLICT" ? coreClassification : "CONFLICT",
    reason: coreClassification === "CONFLICT" ? coreReason : baselineImportReason("BASELINE_CONFLICT"),
    baselineStatus: "BASELINE_CONFLICT",
  };
}

function applyPatientClassificationPreviewState(
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

function normalizeImportCandidates(
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

export async function previewPatientProvisioning(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly PatientProvisioningImportCandidate[],
  database: PatientDatabase = getPrisma(),
  options: PatientImportOptions = {},
): Promise<PatientImportPreview> {
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

  try {
    const normalizedOptions = normalizeImportOptions(options);
    const normalizedCandidates = normalizeImportCandidates(
      candidates,
      parsedScope.data.targetHospitalId,
    );

    await assertPatientProvisioningActorInDatabase(
      database,
      actor.userId,
      parsedScope.data.targetHospitalId,
      "BULK",
    );
    const targetHospital = await database.hospital.findUnique({
      where: { id: parsedScope.data.targetHospitalId },
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

    const rows = normalizedCandidates.map((candidate) => {
      if (!candidate.input) {
        return toPreviewRow(candidate, "INVALID", candidate.validationMessage);
      }

      if (hasHospitalTextMismatch(candidate, targetHospital.name)) {
        return toPreviewRow(
          candidate,
          "HOSPITAL_MISMATCH",
          "ชื่อโรงพยาบาลในไฟล์ไม่ตรงกับโรงพยาบาลที่เลือก ต้องตรวจสอบก่อนนำเข้า",
        );
      }

      const hash = hashByRow.get(candidate.rowNumber);
      const isDuplicate = hash ? (counts.get(hash) ?? 0) > 1 : false;

      if (isDuplicate) {
        return toPreviewRow(candidate, "DUPLICATE_IN_FILE", "พบเลขบัตรประชาชนซ้ำในไฟล์เดียวกัน");
      }

      const existing = hash ? existingByHash.get(hash) : undefined;
      const coreClassification = existing
        ? classifyExistingPatient(existing, candidate.input)
        : { classification: "READY" as const, reason: "พร้อมบันทึกข้อมูลผู้ป่วย" };
      const existingRelationship = existing?.patientProfile?.hospitalRelationships[0];
      const patientClassification = readPatientClassificationImportState(
        candidate,
        existing?.patientProfile?.patientClassification?.classification ?? null,
      );
      const baselineState = readBaselineImportState(candidate, normalizedOptions.effectiveDate);
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

      return toPreviewRow(
        candidate,
        classificationPreview.classification,
        classificationPreview.reason,
        baselinePreview.baselineStatus,
        patientClassification,
      );
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
      targetHospitalId: parsedScope.data.targetHospitalId,
      effectiveDate: normalizedOptions.effectiveDate,
      importContractVersion: normalizedOptions.importContractVersion,
      baselineDateRequired: rows.some(
        ({ baselineStatus }) => baselineStatus === "BASELINE_DATE_REQUIRED",
      ),
      file: normalizedCandidates.find((candidate) => candidate.fileMetadata)?.fileMetadata ?? null,
      rows,
      classificationReconciliations,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient import preview could not be prepared");
  }
}

function toImportResultRow(
  row: PatientImportPreviewRow,
  result: PatientImportRowResult["result"],
  reason = row.reason,
  baselineStatus = row.baselineStatus,
): PatientImportRowResult {
  return { ...row, result, reason, baselineStatus };
}

function getResultStatusForPreview(
  row: PatientImportPreviewRow,
  classificationChoice: PatientImportClassificationReconciliationChoice | null = null,
): PatientImportRowResult["result"] | null {
  if (row.classification === "INVALID") {
    return "INVALID";
  }

  if (row.classification === "DUPLICATE_IN_FILE") {
    return "DUPLICATE_IN_FILE";
  }

  if (row.classification === "CONFLICT") {
    return "CONFLICT";
  }

  if (row.classification === "NEEDS_REVIEW") {
    const classification = row.patientClassification;

    if (
      classification.status === "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION" &&
      classificationChoice?.rowNumber === row.rowNumber &&
      classificationChoice.currentClassification === classification.currentClassification &&
      classificationChoice.sourceClassification === classification.sourceClassification
    ) {
      return null;
    }

    return "NEEDS_REVIEW";
  }

  if (row.classification === "HOSPITAL_MISMATCH") {
    return "HOSPITAL_MISMATCH";
  }

  if (row.classification === "UNSUPPORTED_REQUIREMENT") {
    return "UNSUPPORTED_REQUIREMENT";
  }

  return null;
}

const patientRosterBaselineSelect = {
  recordedOn: true,
  weight: true,
  heightCm: true,
  waistCircumference: true,
  bloodSugarDtx: true,
  hba1c: true,
} satisfies Prisma.PatientBaselineSelect;

type PatientRosterImportRowResult = {
  patient: PatientProvisioningResult;
  baselineStatus: PatientImportBaselineStatus;
  classificationResult: PatientClassificationMutationResult | null;
};

async function importPatientRosterRow(
  actor: ActorContext,
  candidate: PatientProvisioningImportCandidate,
  effectiveDate: string | null,
  dependencies: PatientProvisioningServiceDependencies,
  classificationChoice: PatientImportClassificationReconciliationChoice | null,
): Promise<PatientRosterImportRowResult> {
  if (!candidate.input) {
    throw new ValidationError("ข้อมูลแถวนี้ไม่ถูกต้อง");
  }

  const patientInput = candidate.input;

  const baselineState = readBaselineImportState(candidate, effectiveDate);

  if (baselineState.status === "BASELINE_DATA_INVALID") {
    throw new ValidationError("ข้อมูลตั้งต้นของแถวนี้ไม่ถูกต้อง");
  }

  if (baselineState.status === "BASELINE_DATE_REQUIRED") {
    throw new ValidationError("ต้องระบุวันที่ข้อมูลตั้งต้นก่อนยืนยันนำเข้า");
  }

  const rawSourceClassification = candidate.canonicalRow.clinicalCandidates.diabetesClassification;
  const parsedSourceClassification = patientClassificationTypeSchema.safeParse(rawSourceClassification);
  const sourceClassification = parsedSourceClassification.success
    ? parsedSourceClassification.data
    : null;
  const hasValidClassificationSource =
    sourceClassification !== null &&
    candidate.canonicalRow.fieldAssessments.diabetesClassification.diagnostics.length === 0;

  try {
    return await runSerializableTransaction(
      getDatabase(dependencies),
      async (transaction): Promise<PatientRosterImportRowResult> => {
        const now = baselineState.status === "BASELINE_READY" || hasValidClassificationSource
          ? getImportNow(dependencies)
          : null;
        const patient = await provisionPatientInTransaction(
          transaction,
          actor,
          patientInput,
          "BULK",
        );

        let baselineStatus: PatientImportBaselineStatus = "NOT_APPLICABLE";

        if (baselineState.status !== "NOT_APPLICABLE") {
          if (now === null) {
            throw new ValidationError("ข้อมูลตั้งต้นของแถวนี้ไม่พร้อมบันทึก");
          }

          const access = await resolvePatientBaselineAccessContext(
            actor,
            patient.relationshipId,
            PATIENT_BASELINE_CREATE_CAPABILITY,
            transaction,
          );
          const existing = await transaction.patientBaseline.findUnique({
            where: {
              patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
            },
            select: patientRosterBaselineSelect,
          });

          if (!existing) {
            await createPatientBaselineInTransaction(
              transaction,
              actor,
              buildBaselineCreateInput(patient.relationshipId, baselineState),
              now,
              "ROSTER_IMPORT",
            );
            baselineStatus = "BASELINE_CREATED";
          } else if (baselineImportMatchesExisting(baselineState, existing)) {
            baselineStatus = "BASELINE_ALREADY_EXISTS";
          } else {
            throw new PatientBaselineImportConflictError();
          }
        }

        const classificationResult = sourceClassification && now
          ? await setPatientClassificationInTransaction(
              transaction,
              actor,
              {
                patientProfileId: patient.patientProfileId,
                patientHospitalRelationshipId: patient.relationshipId,
                targetHospitalId: patient.hospitalId,
                classification: sourceClassification,
                source: "ROSTER_IMPORT",
                ...(classificationChoice
                  ? {
                      expectedCurrentClassification: classificationChoice.currentClassification,
                      explicitChangeConfirmation: true,
                    }
                  : {}),
              },
              now,
            )
          : null;

        return { patient, baselineStatus, classificationResult };
      },
      dependencies.transactionRetries ?? DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

function importResultReason(
  patientOutcome: PatientProvisioningResult["outcome"],
  baselineStatus: PatientImportBaselineStatus,
  classificationResult: PatientClassificationMutationResult | null,
): string {
  const classificationMessage = classificationResult
    ? classificationResult.operation === "CREATED"
      ? "บันทึกสถานะผู้ป่วยแล้ว"
      : classificationResult.operation === "CHANGED"
        ? "เปลี่ยนสถานะผู้ป่วยแล้ว"
        : "สถานะผู้ป่วยตรงกับข้อมูลปัจจุบัน"
    : null;

  if (baselineStatus === "BASELINE_CREATED") {
    const message = patientOutcome === "CREATED"
      ? "บันทึกข้อมูลผู้ป่วยและข้อมูลตั้งต้นแล้ว"
      : "มีข้อมูลผู้ป่วยแล้ว และบันทึกข้อมูลตั้งต้นแล้ว";
    return classificationMessage ? `${message} ${classificationMessage}` : message;
  }

  if (baselineStatus === "BASELINE_ALREADY_EXISTS") {
    const message = "มีข้อมูลผู้ป่วยและข้อมูลตั้งต้นนี้แล้ว ระบบไม่สร้างซ้ำ";
    return classificationMessage ? `${message} ${classificationMessage}` : message;
  }

  const message = patientOutcome === "CREATED" ? "บันทึกข้อมูลผู้ป่วยแล้ว" : "มีข้อมูลผู้ป่วยนี้แล้ว";
  return classificationMessage ? `${message} ${classificationMessage}` : message;
}

function findClassificationChoice(
  choices: readonly PatientImportClassificationReconciliationChoice[],
  row: PatientImportPreviewRow,
): PatientImportClassificationReconciliationChoice | null {
  return choices.find(({ rowNumber }) => rowNumber === row.rowNumber) ?? null;
}

export async function importPatientProvisioning(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly PatientProvisioningImportCandidate[],
  dependencies: PatientProvisioningServiceDependencies = {},
  options: PatientImportOptions = {},
): Promise<PatientImportResultSummary> {
  const normalizedOptions = normalizeImportOptions(options);
  const normalizedCandidates = normalizeImportCandidates(candidates, targetHospitalId);
  const preview = await previewPatientProvisioning(
    actor,
    targetHospitalId,
    normalizedCandidates,
    getDatabase(dependencies),
    normalizedOptions,
  );

  if (preview.baselineDateRequired) {
    throw new ValidationError("ต้องระบุวันที่ข้อมูลตั้งต้นก่อนยืนยันนำเข้า");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  const rows: PatientImportRowResult[] = [];
  let imported = 0;
  let alreadyExists = 0;
  let duplicateInFile = 0;
  let invalid = 0;
  let conflict = 0;
  let needsReview = 0;
  let hospitalMismatch = 0;
  let unsupportedRequirement = 0;
  let failed = 0;
  let baselineCreated = 0;
  let baselineAlreadyExists = 0;
  let baselineConflict = 0;
  let baselineInvalid = 0;
  let baselineDateRequired = 0;
  let classificationCreated = 0;
  let classificationAlreadyExists = 0;
  let classificationChanged = 0;
  let classificationNeedsReview = 0;
  let classificationInvalid = 0;

  for (const [index, candidate] of normalizedCandidates.entries()) {
    const previewRow = preview.rows[index];
    const classificationChoice = findClassificationChoice(
      normalizedOptions.classificationReconciliationChoices,
      previewRow,
    );
    const previewResult = getResultStatusForPreview(previewRow, classificationChoice);

    if (previewResult) {
      rows.push(toImportResultRow(previewRow, previewResult));
      if (previewResult === "DUPLICATE_IN_FILE") duplicateInFile += 1;
      if (previewResult === "INVALID") invalid += 1;
      if (previewResult === "CONFLICT") conflict += 1;
      if (previewResult === "NEEDS_REVIEW") needsReview += 1;
      if (previewResult === "HOSPITAL_MISMATCH") hospitalMismatch += 1;
      if (previewResult === "UNSUPPORTED_REQUIREMENT") unsupportedRequirement += 1;
      if (previewRow.baselineStatus === "BASELINE_CONFLICT") baselineConflict += 1;
      if (previewRow.baselineStatus === "BASELINE_DATA_INVALID") baselineInvalid += 1;
      if (previewRow.baselineStatus === "BASELINE_DATE_REQUIRED") baselineDateRequired += 1;
      if (previewRow.patientClassification.status === "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION") {
        classificationNeedsReview += 1;
      }
      if (previewRow.patientClassification.status === "CLASSIFICATION_DATA_INVALID") {
        classificationInvalid += 1;
      }
      continue;
    }

    if (!candidate.input) {
      rows.push(toImportResultRow(previewRow, "INVALID", "ข้อมูลแถวนี้ไม่ครบถ้วน"));
      invalid += 1;
      continue;
    }

    try {
      const result = await importPatientRosterRow(
        actor,
        candidate,
        normalizedOptions.effectiveDate,
        dependencies,
        classificationChoice,
      );

      if (result.baselineStatus === "BASELINE_CREATED") baselineCreated += 1;
      if (result.baselineStatus === "BASELINE_ALREADY_EXISTS") baselineAlreadyExists += 1;
      if (result.classificationResult?.operation === "CREATED") classificationCreated += 1;
      if (result.classificationResult?.operation === "NOOP") classificationAlreadyExists += 1;
      if (result.classificationResult?.operation === "CHANGED") classificationChanged += 1;

      if (result.patient.outcome === "CREATED") {
        imported += 1;
        rows.push(
          toImportResultRow(
            previewRow,
            "IMPORTED",
            importResultReason(
              result.patient.outcome,
              result.baselineStatus,
              result.classificationResult,
            ),
            result.baselineStatus,
          ),
        );
      } else {
        alreadyExists += 1;
        rows.push(
          toImportResultRow(
            previewRow,
            "ALREADY_EXISTS",
            importResultReason(
              result.patient.outcome,
              result.baselineStatus,
              result.classificationResult,
            ),
            result.baselineStatus,
          ),
        );
      }
    } catch (error: unknown) {
      if (error instanceof ForbiddenError) {
        throw error;
      }

      if (error instanceof ValidationError) {
        invalid += 1;
        if (previewRow.baselineStatus === "BASELINE_DATA_INVALID") baselineInvalid += 1;
        if (previewRow.baselineStatus === "BASELINE_DATE_REQUIRED") baselineDateRequired += 1;
        rows.push(
          toImportResultRow(
            previewRow,
            "INVALID",
            previewRow.baselineStatus === "BASELINE_DATA_INVALID" ||
              previewRow.baselineStatus === "BASELINE_DATE_REQUIRED"
              ? baselineImportReason(previewRow.baselineStatus) ?? "ข้อมูลแถวนี้ไม่ถูกต้อง"
              : "ข้อมูลแถวนี้ไม่ถูกต้อง",
            previewRow.baselineStatus,
          ),
        );
        continue;
      }

      if (error instanceof PatientBaselineImportConflictError) {
        conflict += 1;
        baselineConflict += 1;
        rows.push(
          toImportResultRow(
            previewRow,
            "CONFLICT",
            baselineImportReason("BASELINE_CONFLICT"),
            "BASELINE_CONFLICT",
          ),
        );
        continue;
      }

      if (error instanceof ConflictError) {
        if (
          previewRow.patientClassification.status ===
          "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION"
        ) {
          needsReview += 1;
          classificationNeedsReview += 1;
          rows.push(
            toImportResultRow(
              previewRow,
              "NEEDS_REVIEW",
              "สถานะผู้ป่วยเปลี่ยนแปลงระหว่างตรวจสอบและยืนยัน กรุณาตรวจสอบใหม่",
            ),
          );
        } else {
          conflict += 1;
          rows.push(toImportResultRow(previewRow, "CONFLICT", "ข้อมูลขัดแย้ง ต้องตรวจสอบโดยผู้ดูแล"));
        }
        continue;
      }

      failed += 1;
      rows.push(toImportResultRow(previewRow, "FAILED", "ระบบไม่สามารถบันทึกแถวนี้ได้"));
    }
  }

  return {
    targetHospitalId,
    imported,
    alreadyExists,
    duplicateInFile,
    invalid,
    conflict,
    needsReview,
    hospitalMismatch,
    unsupportedRequirement,
    failed,
    baselineCreated,
    baselineAlreadyExists,
    baselineConflict,
    baselineInvalid,
    baselineDateRequired,
    classificationCreated,
    classificationAlreadyExists,
    classificationChanged,
    classificationNeedsReview,
    classificationInvalid,
    rows,
    file: preview.file,
  };
}

export const patientProvisioningInternals = {
  assertReusableUser: patientProvisioningTransactionInternals.assertReusableUser,
  classifyExistingPatient,
  hasDirectHospitalProvisioningScope,
  hasOsmHospitalProvisioningScope,
  classificationImportReason,
  readPatientClassificationImportState,
};
