import "server-only";

import {
  Role,
  UserStatus,
  type Prisma,
} from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import {
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
  patientProvisionInputSchema,
  patientProvisionScopeSchema,
} from "../schemas/patient-provisioning-schemas";
import {
  PATIENT_IMPORT_BASELINE_FIELD_KEYS,
  PATIENT_IMPORT_CONTRACT_VERSION,
  PATIENT_IMPORT_FIELD_KEYS,
  isPatientImportBaselineField,
  isPatientImportClassificationField,
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
  PatientImportOptions,
  PatientImportPreview,
  PatientImportPreviewRow,
  PatientRosterImportDatabase,
  PatientRosterImportServiceDependencies,
} from "./patient-roster-import-types";

export type PreviewPerson = {
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
    }[];
  } | null;
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

/** The person fields an identity check needs, scoped to the target Hospital's relationship. */
export function buildPreviewPersonSelect(targetHospitalId: string) {
  return {
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
          },
        },
      },
    },
  } satisfies Prisma.PersonSelect;
}

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
} {
  const effectiveDate = options.effectiveDate ?? null;

  if (effectiveDate !== null && !patientBaselineDateOnlySchema.safeParse(effectiveDate).success) {
    throw new ValidationError("วันที่ข้อมูลตั้งต้นไม่ถูกต้อง");
  }

  const importContractVersion = options.importContractVersion ?? PATIENT_IMPORT_CONTRACT_VERSION;

  if (importContractVersion !== PATIENT_IMPORT_CONTRACT_VERSION) {
    throw new ValidationError("เวอร์ชันการนำเข้าไม่ถูกต้อง");
  }

  return { effectiveDate, importContractVersion };
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

export function baselineImportReason(status: PatientImportBaselineStatus): string | null {
  switch (status) {
    case "BASELINE_READY":
      return "ข้อมูลตั้งต้นพร้อมบันทึกตามวันที่ที่เลือก";
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

/**
 * Classification belongs to the patient profile and import never changes one that
 * is already set: it is only recorded when the profile has none yet.
 */
export function readPatientClassificationImportState(
  candidate: PatientProvisioningImportCandidate,
  currentClassification: PatientClassificationType | null,
): PatientImportClassificationPreview {
  if (!hasClassificationSourceAssertion(candidate)) {
    return { status: "NOT_APPLICABLE", sourceClassification: null };
  }

  const sourceClassification = candidate.canonicalRow.clinicalCandidates.diabetesClassification;
  const assessment = candidate.canonicalRow.fieldAssessments.diabetesClassification;
  const parsedSourceClassification = patientClassificationTypeSchema.safeParse(sourceClassification);

  if (
    sourceClassification === null ||
    !parsedSourceClassification.success ||
    assessment.diagnostics.length > 0
  ) {
    return { status: "CLASSIFICATION_DATA_INVALID", sourceClassification: null };
  }

  return {
    status: currentClassification === null ? "CLASSIFICATION_READY" : "CLASSIFICATION_ALREADY_EXISTS",
    sourceClassification: parsedSourceClassification.data,
  };
}

export function classificationImportReason(
  state: PatientImportClassificationPreview,
): string | null {
  switch (state.status) {
    case "CLASSIFICATION_READY":
      return "สถานะผู้ป่วยจากไฟล์พร้อมบันทึก";
    case "CLASSIFICATION_ALREADY_EXISTS":
      return "ผู้ป่วยมีสถานะอยู่แล้ว ระบบจะไม่เปลี่ยนสถานะเดิม";
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

/**
 * Identity check for a person that already exists. A patient that already has a
 * relationship with the target Hospital is `ALREADY_EXISTS` or `CONFLICT` and
 * nothing else about them is evaluated; a person known only elsewhere is `READY`
 * (a new relationship with this Hospital).
 */
export function classifyExistingPatient(
  existing: PreviewPerson,
  input: NonNullable<PatientProvisioningImportCandidate["input"]>,
): { classification: "READY" | "ALREADY_EXISTS" | "CONFLICT"; reason: string | null } {
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

  if (!relationship) {
    return { classification: "READY", reason: "พร้อมบันทึกข้อมูลผู้ป่วย" };
  }

  if (
    relationship.hospitalNumber &&
    input.hospitalNumber &&
    relationship.hospitalNumber !== input.hospitalNumber
  ) {
    return {
      classification: "CONFLICT",
      reason: "HN ของความสัมพันธ์กับโรงพยาบาลนี้ไม่ตรงกัน",
    };
  }

  const hasPatientRole = existing.user?.roles.some(({ role }) => role === Role.PATIENT) ?? false;

  if (!hasPatientRole) {
    return {
      classification: "CONFLICT",
      reason: "ข้อมูลผู้ป่วยเดิมอยู่ในสถานะที่ต้องตรวจสอบโดยผู้ดูแล",
    };
  }

  return {
    classification: "ALREADY_EXISTS",
    reason: "มีผู้ป่วยรายนี้ในโรงพยาบาลแล้ว ระบบไม่เปลี่ยนแปลงข้อมูลเดิม",
  };
}

function toPreviewRow(
  candidate: PatientProvisioningImportCandidate,
  classification: PatientImportClassification,
  reason: string | null,
  baselineStatus: PatientImportBaselineStatus = "NOT_APPLICABLE",
  patientClassification: PatientImportClassificationPreview = {
    status: "NOT_APPLICABLE",
    sourceClassification: null,
  },
): PatientImportPreviewRow {
  const requirementGatedFields =
    classification === "READY"
      ? PATIENT_IMPORT_FIELD_KEYS.filter((field) => {
          if (
            field === "nationalId" ||
            field === "givenName" ||
            field === "familyName" ||
            field === "hospitalNumber"
          ) {
            return false;
          }

          if (isPatientImportBaselineField(field) || isPatientImportClassificationField(field)) {
            return false;
          }

          const assessment = candidate.canonicalRow.fieldAssessments[field];
          return assessment.present && assessment.status !== "NOT_PRESENT";
        })
      : [];

  const diagnosticCodes = [...new Set(candidate.canonicalRow.diagnostics.map(({ code }) => code))];

  return {
    rowNumber: candidate.rowNumber,
    identityDisplay: candidate.identityDisplay,
    givenName: candidate.givenName,
    familyName: candidate.familyName,
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
  };
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

export function composePatientRosterPreviewRow(input: {
  candidate: PatientProvisioningImportCandidate;
  hash: string | undefined;
  duplicateCount: number;
  existing: PreviewPerson | undefined;
  effectiveDate: string | null;
}): PatientImportPreviewRow {
  if (!input.candidate.input) {
    return toPreviewRow(input.candidate, "INVALID", input.candidate.validationMessage);
  }

  if (input.hash && input.duplicateCount > 1) {
    return toPreviewRow(input.candidate, "DUPLICATE_IN_FILE", "พบเลขบัตรประชาชนซ้ำในไฟล์เดียวกัน");
  }

  const identity = input.existing
    ? classifyExistingPatient(input.existing, input.candidate.input)
    : { classification: "READY" as const, reason: "พร้อมบันทึกข้อมูลผู้ป่วย" };

  if (identity.classification !== "READY") {
    return toPreviewRow(input.candidate, identity.classification, identity.reason);
  }

  const patientClassification = readPatientClassificationImportState(
    input.candidate,
    input.existing?.patientProfile?.patientClassification?.classification ?? null,
  );
  const baselineState = readBaselineImportState(input.candidate, input.effectiveDate);

  if (
    baselineState.status === "BASELINE_DATA_INVALID" ||
    baselineState.status === "BASELINE_DATE_REQUIRED"
  ) {
    return toPreviewRow(
      input.candidate,
      "INVALID",
      baselineImportReason(baselineState.status),
      baselineState.status,
      patientClassification,
    );
  }

  if (patientClassification.status === "CLASSIFICATION_DATA_INVALID") {
    return toPreviewRow(
      input.candidate,
      "INVALID",
      classificationImportReason(patientClassification),
      baselineState.status,
      patientClassification,
    );
  }

  return toPreviewRow(
    input.candidate,
    "READY",
    identity.reason,
    baselineState.status,
    patientClassification,
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
  },
): Promise<PatientImportPreview> {
  try {
    await assertPatientProvisioningActorInDatabase(
      database,
      actor.userId,
      targetHospitalId,
      "BULK",
    );

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
          select: buildPreviewPersonSelect(targetHospitalId),
        })
      : [];
    const existingByHash = new Map<string, PreviewPerson>(
      people.map((person) => [person.identityKeyHash, person]),
    );

    const rows = normalizedCandidates.map((candidate) => {
      const hash = hashByRow.get(candidate.rowNumber);

      return composePatientRosterPreviewRow({
        candidate,
        hash,
        duplicateCount: hash ? counts.get(hash) ?? 0 : 0,
        existing: hash ? existingByHash.get(hash) : undefined,
        effectiveDate: normalizedOptions.effectiveDate,
      });
    });

    return {
      targetHospitalId,
      effectiveDate: normalizedOptions.effectiveDate,
      importContractVersion: normalizedOptions.importContractVersion,
      baselineDateRequired: rows.some(
        ({ baselineStatus }) => baselineStatus === "BASELINE_DATE_REQUIRED",
      ),
      file: normalizedCandidates.find((candidate) => candidate.fileMetadata)?.fileMetadata ?? null,
      rows,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient import preview could not be prepared");
  }
}

export const patientRosterImportPreviewInternals = {
  baselineImportReason,
  buildBaselineCreateInput,
  classifyExistingPatient,
  classificationImportReason,
  composePatientRosterPreviewRow,
  normalizeImportCandidates,
  normalizeImportOptions,
  readBaselineImportState,
  readPatientClassificationImportState,
};
