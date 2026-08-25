import "server-only";

import {
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import {
  DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
  runSerializableTransaction,
} from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
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
import { PATIENT_IMPORT_FIELD_KEYS } from "../import/patient-import-contract";
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
  transactionRetries?: number;
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

export type PatientImportPreviewRow = {
  rowNumber: number;
  identityDisplay: string;
  givenName: string;
  familyName: string;
  combinedNameText: string | null;
  hospitalNumber: string | null;
  classification: PatientImportClassification;
  reason: string | null;
  requirementGatedFields: readonly PatientImportFieldKey[];
  diagnosticCodes: readonly PatientImportDiagnosticCode[];
};

export type PatientImportPreview = {
  targetHospitalId: string;
  rows: PatientImportPreviewRow[];
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
  rows: PatientImportRowResult[];
  file: PatientImportFileMetadata | null;
};

function getDatabase(dependencies: PatientProvisioningServiceDependencies): PatientDatabase {
  return dependencies.database ?? getPrisma();
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
    hospitalRelationships: { id: string; hospitalNumber: string | null }[];
  } | null;
};

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
): PatientImportPreviewRow {
  const requirementGatedFields = PATIENT_IMPORT_FIELD_KEYS.filter((field) => {
    if (field === "nationalId" || field === "givenName" || field === "familyName" || field === "hospitalNumber") {
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
    reason:
      reason ??
      (requirementGatedFields.length > 0
        ? "ข้อมูลหลักพร้อมนำเข้า แต่ข้อมูลเพิ่มเติมบางรายการยังไม่บันทึกในระยะนี้"
        : null),
    requirementGatedFields,
    diagnosticCodes,
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
                hospitalRelationships: {
                  where: { hospitalId: targetHospitalId },
                  select: { id: true, hospitalNumber: true },
                },
              },
            },
          },
        })
      : [];
    const existingByHash = new Map<string, PreviewPerson>(
      people.map((person) => [person.identityKeyHash, person]),
    );

    return {
      targetHospitalId: parsedScope.data.targetHospitalId,
      file: normalizedCandidates.find((candidate) => candidate.fileMetadata)?.fileMetadata ?? null,
      rows: normalizedCandidates.map((candidate) => {
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

        if (!existing) {
          return toPreviewRow(candidate, "READY", "พร้อมบันทึกข้อมูลผู้ป่วย");
        }

        const classification = classifyExistingPatient(existing, candidate.input);
        return toPreviewRow(candidate, classification.classification, classification.reason);
      }),
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
): PatientImportRowResult {
  return { ...row, result, reason };
}

function getResultStatusForPreview(
  row: PatientImportPreviewRow,
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

export async function importPatientProvisioning(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly PatientProvisioningImportCandidate[],
  dependencies: PatientProvisioningServiceDependencies = {},
): Promise<PatientImportResultSummary> {
  const normalizedCandidates = normalizeImportCandidates(candidates, targetHospitalId);
  const preview = await previewPatientProvisioning(
    actor,
    targetHospitalId,
    normalizedCandidates,
    getDatabase(dependencies),
  );
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

  for (const [index, candidate] of normalizedCandidates.entries()) {
    const previewRow = preview.rows[index];
    const previewResult = getResultStatusForPreview(previewRow);

    if (previewResult) {
      rows.push(toImportResultRow(previewRow, previewResult));
      if (previewResult === "DUPLICATE_IN_FILE") duplicateInFile += 1;
      if (previewResult === "INVALID") invalid += 1;
      if (previewResult === "CONFLICT") conflict += 1;
      if (previewResult === "NEEDS_REVIEW") needsReview += 1;
      if (previewResult === "HOSPITAL_MISMATCH") hospitalMismatch += 1;
      if (previewResult === "UNSUPPORTED_REQUIREMENT") unsupportedRequirement += 1;
      continue;
    }

    if (!candidate.input) {
      rows.push(toImportResultRow(previewRow, "INVALID", "ข้อมูลแถวนี้ไม่ครบถ้วน"));
      invalid += 1;
      continue;
    }

    try {
      const result = await provisionPatientWithAuthorizationMode(
        actor,
        candidate.input,
        dependencies,
        "BULK",
      );

      if (result.outcome === "CREATED") {
        imported += 1;
        rows.push(toImportResultRow(previewRow, "IMPORTED", "บันทึกข้อมูลผู้ป่วยแล้ว"));
      } else {
        alreadyExists += 1;
        rows.push(toImportResultRow(previewRow, "ALREADY_EXISTS", "มีข้อมูลผู้ป่วยนี้แล้ว"));
      }
    } catch (error: unknown) {
      if (error instanceof ForbiddenError) {
        throw error;
      }

      if (error instanceof ValidationError) {
        invalid += 1;
        rows.push(toImportResultRow(previewRow, "INVALID", "ข้อมูลแถวนี้ไม่ถูกต้อง"));
        continue;
      }

      if (error instanceof ConflictError) {
        conflict += 1;
        rows.push(toImportResultRow(previewRow, "CONFLICT", "ข้อมูลขัดแย้ง ต้องตรวจสอบโดยผู้ดูแล"));
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
    rows,
    file: preview.file,
  };
}

export const patientProvisioningInternals = {
  assertReusableUser: patientProvisioningTransactionInternals.assertReusableUser,
  classifyExistingPatient,
  hasDirectHospitalProvisioningScope,
  hasOsmHospitalProvisioningScope,
};
