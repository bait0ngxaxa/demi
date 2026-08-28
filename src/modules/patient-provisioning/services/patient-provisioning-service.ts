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
  ApplicationError,
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
  type ProvisionPatientInput,
} from "../schemas/patient-provisioning-schemas";
import {
  PatientProvisioningConflictError,
  patientProvisioningTransactionInternals,
  provisionPatientInTransaction,
  type PatientProvisioningAuthorizationMode,
  type PatientProvisioningResult,
} from "./patient-provisioning-transaction";
import {
  importPatientRoster,
  patientRosterImportInternals,
  previewPatientRosterImport,
  previewPatientRosterImportInternal,
  projectPatientRosterImportPreview,
  PatientBaselineImportConflictError,
} from "./patient-roster-import-service";
import type {
  PatientImportOptions,
  PatientImportPreview,
  PatientImportPreviewInternal,
  PatientImportResultSummary,
} from "./patient-roster-import-types";

export type { ProvisionPatientInput } from "../schemas/patient-provisioning-schemas";
export type { PatientProvisioningImportCandidate } from "../import/patient-import-contract";
export { PatientBaselineImportConflictError, PatientProvisioningConflictError };
export type {
  PatientProvisioningAuthorizationMode,
  PatientProvisioningConflictKind,
  PatientProvisioningOutcome,
  PatientProvisioningResult,
  PatientTransactionDatabase,
} from "./patient-provisioning-transaction";
export type {
  PatientImportBaselineStatus,
  PatientImportClassification,
  PatientImportClassificationPreview,
  PatientImportClassificationStatus,
  PatientImportClassificationReconciliation,
  PatientImportClassificationReconciliationChoice,
  PatientImportOptions,
  PatientImportOsmCandidatePreview,
  PatientImportOsmAssignmentChoice,
  PatientImportOsmAssignmentPreview,
  PatientImportPreview,
  PatientImportPreviewInternal,
  PatientImportPreviewRow,
  PatientImportPreviewRowInternal,
  PatientImportResultSummary,
  PatientImportRowResult,
  PatientRosterImportDatabase,
  PatientRosterImportServiceDependencies,
} from "./patient-roster-import-types";

export type PatientDatabase = PrismaClient;

export type PatientProvisioningServiceDependencies = {
  database?: PatientDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientProvisioningScope = {
  hospitalId: string;
  hospitalCode: string;
  hospitalName: string;
  canBulkImport: boolean;
};

function getDatabase(
  dependencies: PatientProvisioningServiceDependencies,
): PatientDatabase {
  return dependencies.database ?? getPrisma();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function normalizeDatabaseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002") || isKnownRequestError(error, "P2034")) {
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

/** @deprecated Use the PatientRosterImportService API directly. */
export async function previewPatientProvisioningInternal(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly import("../import/patient-import-contract").PatientProvisioningImportCandidate[],
  database: PatientDatabase = getPrisma(),
  options: PatientImportOptions = {},
): Promise<PatientImportPreviewInternal> {
  return previewPatientRosterImportInternal(
    actor,
    targetHospitalId,
    candidates,
    database,
    options,
  );
}

/** @deprecated Use projectPatientRosterImportPreview from the roster service. */
export function projectPatientImportPreview(
  preview: PatientImportPreviewInternal,
): PatientImportPreview {
  return projectPatientRosterImportPreview(preview);
}

/** @deprecated Use previewPatientRosterImport from the roster service. */
export async function previewPatientProvisioning(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly import("../import/patient-import-contract").PatientProvisioningImportCandidate[],
  database: PatientDatabase = getPrisma(),
  options: PatientImportOptions = {},
): Promise<PatientImportPreview> {
  return previewPatientRosterImport(actor, targetHospitalId, candidates, database, options);
}

/** @deprecated Use importPatientRoster from the roster service. */
export async function importPatientProvisioning(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly import("../import/patient-import-contract").PatientProvisioningImportCandidate[],
  dependencies: PatientProvisioningServiceDependencies = {},
  options: PatientImportOptions = {},
): Promise<PatientImportResultSummary> {
  return importPatientRoster(actor, targetHospitalId, candidates, dependencies, options);
}

export const patientProvisioningInternals = {
  assertReusableUser: patientProvisioningTransactionInternals.assertReusableUser,
  classifyExistingPatient: patientRosterImportInternals.classifyExistingPatient,
  hasDirectHospitalProvisioningScope,
  hasOsmHospitalProvisioningScope,
  classificationImportReason: patientRosterImportInternals.classificationImportReason,
  readPatientClassificationImportState:
    patientRosterImportInternals.readPatientClassificationImportState,
};
