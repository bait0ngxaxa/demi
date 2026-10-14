import "server-only";

import { Prisma, type PatientHospitalHealthHistory, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { APPOINTMENT_READ_CAPABILITY } from "@/modules/appointments/policies/appointment-policy";
import { resolveOwnPatientRelationshipContext } from "@/modules/patient-self/services/patient-self-query-service";
import { resolveAppointmentAccessContext } from "@/modules/appointments/services/appointment-access-service";
import { ApplicationError, ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { patientHealthHistorySchema } from "../schemas/patient-health-history-schemas";

export async function getPatientHealthHistory(
  actor: ActorContext, relationshipId: string, database: PrismaClient = getPrisma(),
): Promise<PatientHospitalHealthHistory | null> {
  // The patient SELF path and the care path re-read current authority from the database.
  try {
    await resolveAppointmentAccessContext(actor, relationshipId, APPOINTMENT_READ_CAPABILITY, database);
  } catch (error: unknown) {
    if (!(error instanceof ForbiddenError || error instanceof NotFoundError)) throw error;
    await resolveOwnPatientRelationshipContext(actor, relationshipId, { database });
  }
  return database.patientHospitalHealthHistory.findUnique({ where: { patientHospitalRelationshipId: relationshipId } });
}

export async function updatePatientHealthHistory(
  actor: ActorContext, relationshipId: string, input: unknown, database: PrismaClient = getPrisma(),
): Promise<{ version: number }> {
  const parsed = patientHealthHistorySchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Health history data is invalid");
  try {
    return await database.$transaction(async (tx) => {
      const access = await resolveAppointmentAccessContext(actor, relationshipId, APPOINTMENT_READ_CAPABILITY, tx);
      if (!access.scopes.directHospital) throw new ForbiddenError();
      const current = await tx.patientHospitalHealthHistory.findUnique({ where: { patientHospitalRelationshipId: relationshipId } });
      const { expectedVersion, ...values } = parsed.data;
      if ((current?.version ?? 0) !== expectedVersion) throw new ConflictError("Health history changed");
      if (current) {
        const updated = await tx.patientHospitalHealthHistory.updateMany({
          where: { id: current.id, version: expectedVersion }, data: { ...values, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new ConflictError("Health history changed");
      } else {
        await tx.patientHospitalHealthHistory.create({ data: { ...values, patientHospitalRelationshipId: relationshipId } });
      }
      await recordAuditEvent({ actorUserId: actor.userId, action: "patient.health_history.updated",
        resourceType: "PatientHospitalRelationship", resourceId: relationshipId,
        metadata: { hospitalId: access.target.hospitalId, fromVersion: expectedVersion, toVersion: expectedVersion + 1 },
      }, tx);
      return { version: expectedVersion + 1 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new ConflictError("Health history changed");
    throw new InfrastructureError("Health history could not be saved");
  }
}
