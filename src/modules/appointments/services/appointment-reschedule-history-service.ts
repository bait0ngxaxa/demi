import "server-only";

import { getPrisma } from "@/lib/db/prisma";
import { HospitalStatus } from "@prisma/client";
import { resolveOwnPatientRelationshipContext } from "@/modules/patient-self/services/patient-self-query-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";
import { APPOINTMENT_READ_CAPABILITY } from "../policies/appointment-policy";
import { resolveAppointmentAccessContext, type AppointmentAccessDatabase } from "./appointment-access-service";
import type { PatientAppointmentRescheduleRequest } from "@prisma/client";
import { appointmentIdSchema } from "../schemas/appointment-schemas";

/** `database` lets a guarded caller run this read on its own TransactionClient snapshot. */
export async function getAppointmentRescheduleHistory(actor: ActorContext, relationshipId: string, appointmentId: string, dependencies: { database?: AppointmentAccessDatabase } = {}): Promise<{
  requests: PatientAppointmentRescheduleRequest[]; canRequest: boolean; canReview: boolean; updatedAt: Date; scheduled: boolean;
}> {
  if (!appointmentIdSchema.safeParse(appointmentId).success) throw new NotFoundError();
  const db = dependencies.database ?? getPrisma();
  let canRequest = false;
  let canReview = false;
  try {
    const access = await resolveAppointmentAccessContext(actor, relationshipId, APPOINTMENT_READ_CAPABILITY, db);
    canRequest = access.scopes.patientSelf || access.scopes.exactOsmAssignment;
    canReview = access.scopes.directHospital;
  } catch (error: unknown) {
    if (!(error instanceof ForbiddenError || error instanceof NotFoundError)) throw error;
    const relationship = await resolveOwnPatientRelationshipContext(actor, relationshipId, { database: db });
    canRequest = relationship.hospitalStatus === HospitalStatus.ACTIVE && relationship.careEndedAt === null;
  }
  const appointment = await db.patientAppointment.findFirst({ where: { id: appointmentId, patientHospitalRelationshipId: relationshipId }, select: { updatedAt: true, status: true } });
  if (!appointment) throw new NotFoundError();
  return { requests: await db.patientAppointmentRescheduleRequest.findMany({ where: { appointmentId }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }] }),
    canRequest, canReview,
    updatedAt: appointment.updatedAt, scheduled: appointment.status === "SCHEDULED" };
}
