import "server-only";

import { Prisma, Role, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { FAMILY_APPOINTMENT_LATEST_READ_CONTRACT, FAMILY_APPOINTMENT_READ_CONTRACTS, isFamilyAppointmentReadContract, olderFamilyAppointmentReadContracts } from "../domain/appointment-grant-contract";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import { appointmentGrantCaregiverWhere, appointmentGrantOwnerWhere } from "../policies/appointment-grant-policy";
import { assertFamilyAuthenticatedActor, assertFamilyPatientSelf } from "../policies/caregiver-relationship-policy";
import { appointmentGrantIdSchema, proposeAppointmentGrantSchema } from "../schemas/appointment-grant-schemas";

export type AppointmentGrantDependencies = {
  database?: PrismaClient;
  now?: () => Date;
};

export function appointmentGrantNow(dependencies: AppointmentGrantDependencies): Date {
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new InfrastructureError("Server time could not be resolved");
  return now;
}

export function rethrowAppointmentGrantError(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
    throw new ConflictError("The appointment sharing state changed concurrently");
  }
  throw new InfrastructureError("Appointment sharing could not be processed");
}

async function patientSelf(transaction: Prisma.TransactionClient, actor: ActorContext): Promise<{ id: string; personId: string }> {
  assertFamilyPatientSelf(actor);
  const profile = await transaction.patientProfile.findFirst({
    where: { personId: actor.personId, person: { is: { user: { is: {
      id: actor.userId, personId: actor.personId, status: "ACTIVE", roles: { some: { role: Role.PATIENT } },
    } } } } }, select: { id: true, personId: true },
  });
  if (!profile) throw new ForbiddenError();
  return profile;
}

export async function proposeAppointmentGrant(
  actor: ActorContext | null | undefined, input: unknown, dependencies: AppointmentGrantDependencies = {},
): Promise<{ grantId: string }> {
  assertFamilyPatientSelf(actor);
  const parsed = proposeAppointmentGrantSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const now = appointmentGrantNow(dependencies);
  try {
    return await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const patient = await patientSelf(transaction, actor);
      const parent = await transaction.caregiverRelationship.findFirst({
        where: { id: parsed.data.caregiverRelationshipId, patientProfileId: patient.id, status: "ACTIVE",
          caregiverUser: { is: { status: "ACTIVE" } }, sourceInvitation: { is: { status: "ACCEPTED", acceptanceContractVersion: "family-delegation-v1" } },
        }, select: { id: true, caregiverUserId: true, caregiverUser: { select: { personId: true } }, sourceInvitation: { select: { caregiverPersonId: true } } },
      });
      const phr = await transaction.patientHospitalRelationship.findFirst({
        where: { id: parsed.data.patientHospitalRelationshipId, patientProfileId: patient.id, ...activePatientHospitalRelationshipWhere, hospital: { is: { status: "ACTIVE" } } },
        select: { id: true },
      });
      if (!parent || !phr || parent.caregiverUser.personId !== parent.sourceInvitation.caregiverPersonId) throw new NotFoundError();
      // AF-5/SR-C1: new proposals use the latest version. An ACTIVE older grant may receive one (the upgrade); it
      // keeps its own projection until the caregiver accepts. Any other actionable grant for the scope blocks a proposal.
      const existing = await transaction.caregiverAppointmentGrant.findFirst({
        where: { caregiverRelationshipId: parent.id, patientHospitalRelationshipId: phr.id, OR: [
          { status: "PENDING" }, { status: "ACTIVE", contractVersion: FAMILY_APPOINTMENT_LATEST_READ_CONTRACT },
        ] }, select: { id: true },
      });
      if (existing) throw new ConflictError("Appointment sharing already exists");
      const grant = await transaction.caregiverAppointmentGrant.create({
        data: { caregiverRelationshipId: parent.id, patientProfileId: patient.id, patientPersonId: patient.personId,
          caregiverUserId: parent.caregiverUserId, caregiverPersonId: parent.caregiverUser.personId,
          patientHospitalRelationshipId: phr.id, contractVersion: FAMILY_APPOINTMENT_LATEST_READ_CONTRACT,
          proposedByUserId: actor.userId, proposedAt: now }, select: { id: true },
      });
      await recordAuditEvent({ actorUserId: actor.userId, action: "caregiver_appointment_grant.proposed",
        resourceType: "caregiver_appointment_grant", resourceId: grant.id, metadata: { contractVersion: FAMILY_APPOINTMENT_LATEST_READ_CONTRACT } }, transaction);
      return { grantId: grant.id };
    });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

export async function acceptAppointmentGrant(
  actor: ActorContext | null | undefined, grantId: unknown, dependencies: AppointmentGrantDependencies = {},
): Promise<void> {
  assertFamilyAuthenticatedActor(actor);
  const parsed = appointmentGrantIdSchema.safeParse(grantId);
  if (!parsed.success) throw new NotFoundError();
  const now = appointmentGrantNow(dependencies);
  try {
    await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const where = { id: parsed.data, ...appointmentGrantCaregiverWhere(actor, "PENDING") };
      const grant = await transaction.caregiverAppointmentGrant.findFirst({
        where, select: { contractVersion: true, caregiverRelationshipId: true, patientHospitalRelationshipId: true },
      });
      if (!grant) throw new NotFoundError();
      // AF-5/SR-C1: accepting a version supersedes the ACTIVE older-version grant of the same scope in the same
      // transaction, so the caregiver never holds two projections and the wider one starts only with this acceptance.
      const older = isFamilyAppointmentReadContract(grant.contractVersion) ? olderFamilyAppointmentReadContracts(grant.contractVersion) : [];
      const superseded = older.length
        ? await transaction.caregiverAppointmentGrant.findFirst({
            where: { caregiverRelationshipId: grant.caregiverRelationshipId, patientHospitalRelationshipId: grant.patientHospitalRelationshipId,
              contractVersion: { in: older }, status: "ACTIVE" }, select: { id: true, contractVersion: true },
          })
        : null;
      if (superseded) {
        const revoked = await transaction.caregiverAppointmentGrant.updateMany({
          where: { id: superseded.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedByUserId: actor.userId, revokedAt: now },
        });
        if (revoked.count !== 1) throw new ConflictError("The appointment sharing state changed concurrently");
        await recordAuditEvent({ actorUserId: actor.userId, action: "caregiver_appointment_grant.revoked",
          resourceType: "caregiver_appointment_grant", resourceId: superseded.id,
          metadata: { contractVersion: superseded.contractVersion, priorStatus: "ACTIVE", reason: "SUPERSEDED", supersededBy: parsed.data } }, transaction);
      }
      const changed = await transaction.caregiverAppointmentGrant.updateMany({
        where, data: { status: "ACTIVE", acceptedByUserId: actor.userId, acceptedAt: now },
      });
      if (changed.count !== 1) throw new NotFoundError();
      await recordAuditEvent({ actorUserId: actor.userId, action: "caregiver_appointment_grant.accepted",
        resourceType: "caregiver_appointment_grant", resourceId: parsed.data, metadata: { contractVersion: grant.contractVersion } }, transaction);
    });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

export async function revokeAppointmentGrant(
  actor: ActorContext | null | undefined, grantId: unknown, dependencies: AppointmentGrantDependencies = {},
): Promise<void> {
  assertFamilyPatientSelf(actor);
  const parsed = appointmentGrantIdSchema.safeParse(grantId);
  if (!parsed.success) throw new NotFoundError();
  const now = appointmentGrantNow(dependencies);
  try {
    await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const where = { id: parsed.data, ...appointmentGrantOwnerWhere(actor), contractVersion: { in: [...FAMILY_APPOINTMENT_READ_CONTRACTS] }, status: { in: ["PENDING", "ACTIVE"] as ("PENDING" | "ACTIVE")[] } };
      const grant = await transaction.caregiverAppointmentGrant.findFirst({ where, select: { status: true, contractVersion: true } });
      if (!grant) throw new NotFoundError();
      const changed = await transaction.caregiverAppointmentGrant.updateMany({ where,
        data: { status: "REVOKED", revokedByUserId: actor.userId, revokedAt: now } });
      if (changed.count !== 1) throw new NotFoundError();
      await recordAuditEvent({ actorUserId: actor.userId, action: "caregiver_appointment_grant.revoked",
        resourceType: "caregiver_appointment_grant", resourceId: parsed.data,
        metadata: { contractVersion: grant.contractVersion, priorStatus: grant.status } }, transaction);
    });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}
