import "server-only";

import {
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { ProviderSessionRevocationOutcome } from "@/modules/account-security/adapters/supabase-account-security-provider";
import {
  ForbiddenError,
  InfrastructureError,
} from "@/shared/errors/application-error";

import {
  hasDirectHospitalProvisioningScope,
  patientProvisioningPolicyInternals,
} from "../policies/patient-provisioning-policy";
import type { ProvisionPatientInput } from "../schemas/patient-provisioning-schemas";
import {
  PatientProvisioningConflictError,
  patientProvisioningTransactionInternals,
  type PatientProvisioningResult,
} from "./patient-provisioning-transaction";
import {
  importPatientRoster,
  patientRosterImportInternals,
  previewPatientRosterImport,
} from "./patient-roster-import-service";
import type {
  PatientImportOptions,
  PatientImportPreview,
  PatientImportResultSummary,
} from "./patient-roster-import-types";

export type { ProvisionPatientInput } from "../schemas/patient-provisioning-schemas";
export type { PatientProvisioningImportCandidate } from "../import/patient-import-contract";
export { PatientProvisioningConflictError };
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
  PatientImportOptions,
  PatientImportPreview,
  PatientImportPreviewRow,
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
  revokeProviderSessions?: (authSubject: string) => Promise<ProviderSessionRevocationOutcome>;
};

export type PatientProvisioningScope = {
  hospitalId: string;
  hospitalCode: string;
  hospitalName: string;
  canBulkImport: boolean;
};

export async function provisionPatient(
  actor: ActorContext | null | undefined,
  input: ProvisionPatientInput,
  dependencies: PatientProvisioningServiceDependencies = {},
): Promise<PatientProvisioningResult> {
  void actor;
  void input;
  void dependencies;
  throw new ForbiddenError("ใช้การนำเข้าผู้ป่วยจาก Excel เท่านั้น");
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
  classificationImportReason: patientRosterImportInternals.classificationImportReason,
  readPatientClassificationImportState:
    patientRosterImportInternals.readPatientClassificationImportState,
};
