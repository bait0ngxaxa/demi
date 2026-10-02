import "server-only";

import { Prisma, Role, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { isFamilyDelegatedAppointmentReadEnabled } from "@/lib/env/server";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ApplicationError, ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { FAMILY_APPOINTMENT_READ_CONTRACT } from "../domain/appointment-grant-contract";
import { appointmentGrantCaregiverWhere, appointmentGrantOwnerWhere } from "../policies/appointment-grant-policy";
import { assertFamilyAuthenticatedActor, assertFamilyPatientSelf } from "../policies/caregiver-relationship-policy";
import { appointmentGrantIdSchema, proposeAppointmentGrantSchema } from "../schemas/appointment-grant-schemas";

export type AppointmentGrantDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  enabled?: boolean;
};

export function assertAppointmentGrantEnabled(dependencies: AppointmentGrantDependencies): void {
  if (!(dependencies.enabled ?? isFamilyDelegatedAppointmentReadEnabled())) throw new NotFoundError();
}

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
  assertAppointmentGrantEnabled(dependencies);
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
        where: { id: parsed.data.patientHospitalRelationshipId, patientProfileId: patient.id, hospital: { is: { status: "ACTIVE" } } },
        select: { id: true },
      });
      if (!parent || !phr || parent.caregiverUser.personId !== parent.sourceInvitation.caregiverPersonId) throw new NotFoundError();
      const existing = await transaction.caregiverAppointmentGrant.findFirst({
        where: { caregiverRelationshipId: parent.id, patientHospitalRelationshipId: phr.id,
          contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT, status: { in: ["PENDING", "ACTIVE"] } }, select: { id: true },
      });
      if (existing) throw new ConflictError("Appointment sharing already exists");
      const grant = await transaction.caregiverAppointmentGrant.create({
        data: { caregiverRelationshipId: parent.id, patientProfileId: patient.id, patientPersonId: patient.personId,
          caregiverUserId: parent.caregiverUserId, caregiverPersonId: parent.caregiverUser.personId,
          patientHospitalRelationshipId: phr.id, contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT,
          proposedByUserId: actor.userId, proposedAt: now }, select: { id: true },
      });
      await recordAuditEvent({ actorUserId: actor.userId, action: "caregiver_appointment_grant.proposed",
        resourceType: "caregiver_appointment_grant", resourceId: grant.id, metadata: { contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT } }, transaction);
      return { grantId: grant.id };
    });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

export async function acceptAppointmentGrant(
  actor: ActorContext | null | undefined, grantId: unknown, dependencies: AppointmentGrantDependencies = {},
): Promise<void> {
  assertAppointmentGrantEnabled(dependencies);
  assertFamilyAuthenticatedActor(actor);
  const parsed = appointmentGrantIdSchema.safeParse(grantId);
  if (!parsed.success) throw new NotFoundError();
  const now = appointmentGrantNow(dependencies);
  try {
    await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const changed = await transaction.caregiverAppointmentGrant.updateMany({
        where: { id: parsed.data, ...appointmentGrantCaregiverWhere(actor, "PENDING") },
        data: { status: "ACTIVE", acceptedByUserId: actor.userId, acceptedAt: now },
      });
      if (changed.count !== 1) throw new NotFoundError();
      await recordAuditEvent({ actorUserId: actor.userId, action: "caregiver_appointment_grant.accepted",
        resourceType: "caregiver_appointment_grant", resourceId: parsed.data, metadata: { contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT } }, transaction);
    });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

export async function revokeAppointmentGrant(
  actor: ActorContext | null | undefined, grantId: unknown, dependencies: AppointmentGrantDependencies = {},
): Promise<void> {
  assertAppointmentGrantEnabled(dependencies);
  assertFamilyPatientSelf(actor);
  const parsed = appointmentGrantIdSchema.safeParse(grantId);
  if (!parsed.success) throw new NotFoundError();
  const now = appointmentGrantNow(dependencies);
  try {
    await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const where = { id: parsed.data, ...appointmentGrantOwnerWhere(actor), contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT, status: { in: ["PENDING", "ACTIVE"] as ("PENDING" | "ACTIVE")[] } };
      const grant = await transaction.caregiverAppointmentGrant.findFirst({ where, select: { status: true } });
      if (!grant) throw new NotFoundError();
      const changed = await transaction.caregiverAppointmentGrant.updateMany({ where,
        data: { status: "REVOKED", revokedByUserId: actor.userId, revokedAt: now } });
      if (changed.count !== 1) throw new NotFoundError();
      await recordAuditEvent({ actorUserId: actor.userId, action: "caregiver_appointment_grant.revoked",
        resourceType: "caregiver_appointment_grant", resourceId: parsed.data,
        metadata: { contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT, priorStatus: grant.status } }, transaction);
    });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}
