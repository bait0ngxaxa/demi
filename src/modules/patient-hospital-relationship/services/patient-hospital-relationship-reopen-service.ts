import "server-only";

import { HospitalStatus, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { maskPersonName } from "@/modules/workforce/services/activation-identity";
import { ApplicationError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { toInfrastructureError } from "@/shared/errors/unexpected-error-report";

import {
  patientHospitalRelationshipReopenLookupSchema,
  patientHospitalRelationshipReopenSchema,
} from "../schemas/patient-hospital-relationship-reopen-schemas";

export type PatientHospitalRelationshipReopenDependencies = {
  database?: PrismaClient;
  now?: () => Date;
};

/** The Hospital is not ACTIVE: a reopen would give care to a Hospital that cannot provide it. */
export class PatientHospitalRelationshipReopenHospitalInactiveError extends ConflictError {
  constructor() {
    super("The Hospital is not active");
    this.name = "PatientHospitalRelationshipReopenHospitalInactiveError";
  }
}

export type PatientHospitalRelationshipReopenPreview = {
  maskedName: string;
  endedAt: Date;
};

export type PatientHospitalRelationshipReopenResult = {
  relationshipId: string;
  hospitalId: string;
  reopenedAt: Date;
  maskedName: string;
  /** The Patient has no active account: the Hospital must issue an activation link (no self-registration window). */
  activationLinkRequired: boolean;
};

type EndedRelationship = {
  id: string;
  hospitalId: string;
  endedAt: Date;
  endedByUserId: string;
  endReason: string;
  maskedName: string;
  activationLinkRequired: boolean;
};

/** Same persisted-role proof as other platform ADMIN operations: an ACTIVE User holding the ADMIN role. */
async function assertPlatformAdminInDatabase(transaction: Prisma.TransactionClient, actor: ActorContext): Promise<void> {
  const persisted = await transaction.user.findUnique({
    where: { id: actor.userId },
    select: { status: true, roles: { select: { role: true } } },
  });

  if (persisted?.status !== UserStatus.ACTIVE || !persisted.roles.some(({ role }) => role === Role.ADMIN)) {
    throw new ForbiddenError();
  }
}

/**
 * Resolves the ended relationship of a national ID with an ACTIVE Hospital. An unknown person, a relationship with
 * another Hospital only, and a relationship that is not ended all answer the same NotFoundError.
 */
async function findEndedRelationship(
  transaction: Prisma.TransactionClient,
  hospitalId: string,
  nationalId: string,
): Promise<EndedRelationship> {
  const hospital = await transaction.hospital.findUnique({ where: { id: hospitalId }, select: { status: true } });
  if (!hospital) throw new NotFoundError();
  if (hospital.status !== HospitalStatus.ACTIVE) throw new PatientHospitalRelationshipReopenHospitalInactiveError();

  const person = await transaction.person.findUnique({
    where: { identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId }) },
    select: {
      givenName: true,
      familyName: true,
      user: { select: { status: true, authSubject: true } },
      patientProfile: {
        select: {
          hospitalRelationships: {
            // Unique on (patientProfileId, hospitalId): at most one row.
            where: { hospitalId },
            take: 1,
            select: { id: true, hospitalId: true, endedAt: true, endedByUserId: true, endReason: true },
          },
        },
      },
    },
  });
  const relationship = person?.patientProfile?.hospitalRelationships[0];
  if (!person || !relationship || relationship.endedAt === null || !relationship.endedByUserId || relationship.endReason === null) {
    throw new NotFoundError();
  }

  return {
    id: relationship.id,
    hospitalId: relationship.hospitalId,
    endedAt: relationship.endedAt,
    endedByUserId: relationship.endedByUserId,
    endReason: relationship.endReason,
    maskedName: maskPersonName(person.givenName, person.familyName),
    activationLinkRequired: !(person.user?.status === UserStatus.ACTIVE && person.user.authSubject !== null),
  };
}

function rethrow(error: unknown, scope: string, message: string): never {
  if (error instanceof ApplicationError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
    throw new ConflictError("Patient care relationship changed");
  }
  throw toInfrastructureError(scope, error, message);
}

/** ADR-0032 confirmation step: the masked name and end time of the ended relationship, for a platform ADMIN only. */
export async function previewPatientHospitalRelationshipReopen(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientHospitalRelationshipReopenDependencies = {},
): Promise<PatientHospitalRelationshipReopenPreview> {
  if (!actor?.roles.includes(Role.ADMIN)) throw new ForbiddenError();
  const parsed = patientHospitalRelationshipReopenLookupSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Patient care reopen lookup is invalid");

  try {
    return await (dependencies.database ?? getPrisma()).$transaction(async (transaction) => {
      await assertPlatformAdminInDatabase(transaction, actor);
      const relationship = await findEndedRelationship(transaction, parsed.data.hospitalId, parsed.data.nationalId);
      return { maskedName: relationship.maskedName, endedAt: relationship.endedAt };
    });
  } catch (error: unknown) {
    rethrow(error, "patient-hospital-relationship.previewPatientHospitalRelationshipReopen", "Patient care relationship could not be found");
  }
}

/**
 * ADR-0032: a platform ADMIN reopens a Patient's ended care relationship with one ACTIVE Hospital. In one
 * serializable transaction the cleared end and this reopen are written to the append-only history, the three end
 * fields are cleared together (guarded by the exact end the ADMIN confirmed) and an ids-only audit event is recorded.
 * Nothing else is restored: OSM assignments, cancelled appointments, rejected service requests and revoked
 * activations stay as they are, and an ACTIVE Program continues.
 */
export async function reopenPatientHospitalRelationship(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientHospitalRelationshipReopenDependencies = {},
): Promise<PatientHospitalRelationshipReopenResult> {
  if (!actor?.roles.includes(Role.ADMIN)) throw new ForbiddenError();
  const parsed = patientHospitalRelationshipReopenSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Patient care reopen data is invalid");
  const { hospitalId, nationalId, reopenReason, expectedEndedAt } = parsed.data;

  try {
    return await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      await assertPlatformAdminInDatabase(transaction, actor);
      const relationship = await findEndedRelationship(transaction, hospitalId, nationalId);
      if (relationship.endedAt.getTime() !== new Date(expectedEndedAt).getTime()) {
        throw new ConflictError("Patient care relationship changed");
      }

      const now = dependencies.now?.() ?? new Date();
      // The history row comes first: the database guard allows clearing the end only when it preserves this end.
      const reopening = await transaction.patientHospitalRelationshipReopening.create({
        data: {
          patientHospitalRelationshipId: relationship.id,
          hospitalId: relationship.hospitalId,
          previousEndedAt: relationship.endedAt,
          previousEndedByUserId: relationship.endedByUserId,
          previousEndReason: relationship.endReason,
          reopenedAt: now,
          reopenedByUserId: actor.userId,
          reopenReason,
        },
        select: { id: true },
      });
      const reopened = await transaction.patientHospitalRelationship.updateMany({
        where: {
          id: relationship.id,
          endedAt: relationship.endedAt,
          endedByUserId: relationship.endedByUserId,
          endReason: relationship.endReason,
        },
        data: { endedAt: null, endedByUserId: null, endReason: null },
      });
      if (reopened.count !== 1) throw new ConflictError("Patient care relationship changed");

      // Free-text reasons stay in the history table, never in audit metadata.
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "patient.hospital_relationship.reopened",
        resourceType: "PatientHospitalRelationship",
        resourceId: relationship.id,
        metadata: {
          basis: "PLATFORM_ADMIN",
          hospitalId: relationship.hospitalId,
          reopeningId: reopening.id,
          previousEndedAt: relationship.endedAt.toISOString(),
          previousEndedByUserId: relationship.endedByUserId,
          reopenedAt: now.toISOString(),
        },
      }, transaction);

      return {
        relationshipId: relationship.id,
        hospitalId: relationship.hospitalId,
        reopenedAt: now,
        maskedName: relationship.maskedName,
        activationLinkRequired: relationship.activationLinkRequired,
      };
    });
  } catch (error: unknown) {
    rethrow(error, "patient-hospital-relationship.reopenPatientHospitalRelationship", "Patient care relationship could not be reopened");
  }
}
