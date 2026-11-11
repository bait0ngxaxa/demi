import "server-only";

import { AppointmentStatus, type Prisma } from "@prisma/client";

import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ConflictError } from "@/shared/errors/application-error";

/** The two single-assignee columns of an Appointment (ADR-0027: at most one is set). */
export type AppointmentAssigneeField = "assignedOsmUserId" | "responsibleUserId";

export type TransferredAppointment = {
  id: string;
  patientHospitalRelationshipId: string;
  /** The new version of the Appointment, written by this transfer. */
  updatedAt: Date;
};

function assigneeIs(field: AppointmentAssigneeField, userId: string | null): Prisma.PatientAppointmentWhereInput {
  return field === "assignedOsmUserId" ? { assignedOsmUserId: userId } : { responsibleUserId: userId };
}

function assigneeData(field: AppointmentAssigneeField, userId: string | null): Prisma.PatientAppointmentUncheckedUpdateManyInput {
  return field === "assignedOsmUserId" ? { assignedOsmUserId: userId } : { responsibleUserId: userId };
}

const AUDIT_KEYS: Record<AppointmentAssigneeField, { previous: string; next: string }> = {
  assignedOsmUserId: { previous: "previousOsmUserId", next: "nextOsmUserId" },
  responsibleUserId: { previous: "previousResponsibleUserId", next: "nextResponsibleUserId" },
};

/**
 * Moves the future SCHEDULED Appointments of one assignee to another assignee, or unassigns them
 * (`nextUserId: null`). Each Appointment is versioned (`updatedAt = max(previous + 1 ms, now)`) and
 * guarded by its previous version, so a concurrent change fails the transaction with a conflict.
 * One `appointment.assignee_handed_over` / `appointment.assignee_unassigned` audit event is written
 * per Appointment. LINE notifications are the caller's decision.
 *
 * Scope: one care relationship when `patientHospitalRelationshipId` is given, otherwise every care
 * relationship of `hospitalId` (including one-off visits outside the assignee's patient assignments).
 */
export async function transferFutureAppointmentAssignee(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    hospitalId: string;
    field: AppointmentAssigneeField;
    previousUserId: string;
    nextUserId: string | null;
    patientHospitalRelationshipId?: string;
    now: Date;
    conflictMessage: string;
    /** Extra ids-only audit metadata, such as the cause of the transfer. */
    auditMetadata?: Record<string, string>;
  },
): Promise<TransferredAppointment[]> {
  const appointments = await transaction.patientAppointment.findMany({
    where: {
      ...(input.patientHospitalRelationshipId === undefined
        ? { patientHospitalRelationship: { hospitalId: input.hospitalId } }
        : { patientHospitalRelationshipId: input.patientHospitalRelationshipId }),
      ...assigneeIs(input.field, input.previousUserId),
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: { gt: input.now },
    },
    orderBy: { id: "asc" },
    select: { id: true, patientHospitalRelationshipId: true, updatedAt: true },
  });
  const keys = AUDIT_KEYS[input.field];
  const transferred: TransferredAppointment[] = [];

  for (const appointment of appointments) {
    const updatedAt = new Date(Math.max(appointment.updatedAt.getTime() + 1, input.now.getTime()));
    const changed = await transaction.patientAppointment.updateMany({
      where: {
        id: appointment.id,
        patientHospitalRelationshipId: appointment.patientHospitalRelationshipId,
        ...assigneeIs(input.field, input.previousUserId),
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: { gt: input.now },
        updatedAt: appointment.updatedAt,
      },
      data: { ...assigneeData(input.field, input.nextUserId), updatedAt },
    });

    if (changed.count !== 1) {
      throw new ConflictError(input.conflictMessage);
    }

    await recordAuditEvent({
      actorUserId: input.actorUserId,
      action: input.nextUserId ? "appointment.assignee_handed_over" : "appointment.assignee_unassigned",
      resourceType: "PatientAppointment",
      resourceId: appointment.id,
      metadata: {
        hospitalId: input.hospitalId,
        patientHospitalRelationshipId: appointment.patientHospitalRelationshipId,
        [keys.previous]: input.previousUserId,
        [keys.next]: input.nextUserId,
        ...input.auditMetadata,
      },
    }, transaction);

    transferred.push({
      id: appointment.id,
      patientHospitalRelationshipId: appointment.patientHospitalRelationshipId,
      updatedAt,
    });
  }

  return transferred;
}
