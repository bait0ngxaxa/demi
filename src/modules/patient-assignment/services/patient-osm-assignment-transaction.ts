import "server-only";

import {
  AppointmentLineNotificationEventKind,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { AuditEventInput } from "@/modules/audit/schemas/audit-schemas";
import {
  ForbiddenError,
  ConflictError,
  NotFoundError,
} from "@/shared/errors/application-error";
import { createAppointmentLineNotificationIntent } from "@/modules/appointments/services/appointment-line-notification-outbox-service";
import { getAppointmentLineNotificationRollout } from "@/modules/appointments/domain/appointment-line-notifications";

import {
  assertPatientOsmAssignmentPolicy,
  PATIENT_ASSIGN_OSM_CAPABILITY,
} from "../policies/patient-osm-assignment-policy";
import type {
  PatientOsmAssignmentRequest,
  PatientOsmUnassignmentRequest,
} from "../schemas/patient-osm-assignment-schemas";

export type PatientOsmAssignmentOperation =
  | "ASSIGNED"
  | "REASSIGNED"
  | "UNASSIGNED"
  | "NOOP";

export type PatientOsmAssignmentMutationResult = {
  operation: PatientOsmAssignmentOperation;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  assignmentId: string | null;
  osmUserId: string | null;
  previousOsmUserId: string | null;
};

async function assertOwnerInDatabase(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  targetHospitalId: string,
): Promise<void> {
  const actor = await transaction.user.findUnique({
    where: { id: actorUserId },
    select: {
      status: true,
      roles: { select: { role: true } },
    },
  });

  if (
    actor?.status !== UserStatus.ACTIVE ||
    !actor.roles.some(({ role }) => role === Role.HOSPITAL)
  ) {
    throw new ForbiddenError();
  }

  const ownerMembership = await transaction.hospitalMembership.findFirst({
    where: {
      userId: actorUserId,
      hospitalId: targetHospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      hospital: { status: HospitalStatus.ACTIVE },
    },
    select: { id: true },
  });

  if (!ownerMembership) {
    throw new ForbiddenError();
  }
}

async function resolvePatientHospitalRelationship(
  transaction: Prisma.TransactionClient,
  relationshipId: string,
): Promise<{ id: string; hospitalId: string; patientUserId: string | null }> {
  const relationship = await transaction.patientHospitalRelationship.findFirst({
    where: {
      id: relationshipId,
      ...activePatientHospitalRelationshipWhere,
      hospital: { status: HospitalStatus.ACTIVE },
      patientProfile: {
        person: {
          user: { roles: { some: { role: Role.PATIENT } } },
        },
      },
    },
    select: {
      id: true,
      hospitalId: true,
      patientProfile: { select: { person: { select: { user: { select: { id: true } } } } } },
    },
  });

  if (!relationship) {
    throw new NotFoundError();
  }

  return {
    id: relationship.id,
    hospitalId: relationship.hospitalId,
    patientUserId: relationship.patientProfile.person.user?.id ?? null,
  };
}

async function handoffFutureAppointments(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    hospitalId: string;
    patientHospitalRelationshipId: string;
    patientUserId: string | null;
    previousOsmUserId: string;
    nextOsmUserId: string | null;
    now: Date;
  },
): Promise<void> {
  const appointments = await transaction.patientAppointment.findMany({
    where: {
      patientHospitalRelationshipId: input.patientHospitalRelationshipId,
      assignedOsmUserId: input.previousOsmUserId,
      status: "SCHEDULED",
      locationType: "HOME_VISIT",
      scheduledAt: { gt: input.now },
    },
    orderBy: { id: "asc" },
    select: { id: true, updatedAt: true },
  });
  const rollout = input.nextOsmUserId ? getAppointmentLineNotificationRollout() : null;

  for (const appointment of appointments) {
    const updatedAt = new Date(Math.max(appointment.updatedAt.getTime() + 1, input.now.getTime()));
    const changed = await transaction.patientAppointment.updateMany({
      where: {
        id: appointment.id,
        patientHospitalRelationshipId: input.patientHospitalRelationshipId,
        assignedOsmUserId: input.previousOsmUserId,
        status: "SCHEDULED",
        locationType: "HOME_VISIT",
        scheduledAt: { gt: input.now },
        updatedAt: appointment.updatedAt,
      },
      data: { assignedOsmUserId: input.nextOsmUserId, updatedAt },
    });

    if (changed.count !== 1) {
      throw new ConflictError("The Appointment changed during OSM reassignment");
    }

    await recordAuditEvent({
      actorUserId: input.actorUserId,
      action: input.nextOsmUserId
        ? "appointment.assignee_handed_over"
        : "appointment.assignee_unassigned",
      resourceType: "PatientAppointment",
      resourceId: appointment.id,
      metadata: {
        hospitalId: input.hospitalId,
        patientHospitalRelationshipId: input.patientHospitalRelationshipId,
        previousOsmUserId: input.previousOsmUserId,
        nextOsmUserId: input.nextOsmUserId,
      },
    }, transaction);

    if (input.nextOsmUserId && rollout) {
      await createAppointmentLineNotificationIntent(transaction, {
        appointmentId: appointment.id,
        patientHospitalRelationshipId: input.patientHospitalRelationshipId,
        sourceUpdatedAt: updatedAt,
        eventKind: AppointmentLineNotificationEventKind.OSM_APPOINTMENT_ASSIGNED,
        patientUserId: input.patientUserId,
      }, rollout, input.now, undefined, { onlyOsmUserId: input.nextOsmUserId });
    }
  }
}

async function assertTargetOsmInDatabase(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  osmUserId: string,
  targetHospitalId: string,
): Promise<void> {
  if (actorUserId === osmUserId) {
    throw new ForbiddenError();
  }

  const osm = await transaction.user.findFirst({
    where: {
      id: osmUserId,
      status: UserStatus.ACTIVE,
      roles: { some: { role: Role.OSM } },
      osmHospitalRelationships: {
        some: {
          hospitalId: targetHospitalId,
          status: MembershipStatus.ACTIVE,
          hospital: { status: HospitalStatus.ACTIVE },
        },
      },
    },
    select: { id: true },
  });

  if (!osm) {
    throw new ForbiddenError();
  }
}

async function resolveActiveAssignment(
  transaction: Prisma.TransactionClient,
  patientHospitalRelationshipId: string,
): Promise<{
  id: string;
  osmUserId: string;
} | null> {
  return transaction.patientOsmAssignment.findFirst({
    where: {
      patientHospitalRelationshipId,
      endedAt: null,
    },
    select: { id: true, osmUserId: true },
  });
}

/** The audit event of one created assignment, shared by the single and the bulk path. */
export function buildPatientOsmAssignedAuditEvent(input: {
  actorUserId: string;
  assignmentId: string;
  hospitalId: string;
  patientHospitalRelationshipId: string;
  osmUserId: string;
  previousOsmUserId?: string | null;
}): AuditEventInput {
  return {
    actorUserId: input.actorUserId,
    action: input.previousOsmUserId ? "patient.osm_reassigned" : "patient.osm_assigned",
    resourceType: "PatientOsmAssignment",
    resourceId: input.assignmentId,
    metadata: {
      hospitalId: input.hospitalId,
      patientHospitalRelationshipId: input.patientHospitalRelationshipId,
      osmUserId: input.osmUserId,
      ...(input.previousOsmUserId ? { previousOsmUserId: input.previousOsmUserId } : {}),
    },
  };
}

export async function assignOsmToPatientInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientOsmAssignmentRequest,
  now: Date,
): Promise<PatientOsmAssignmentMutationResult> {
  const relationship = await resolvePatientHospitalRelationship(
    transaction,
    input.patientHospitalRelationshipId,
  );

  assertPatientOsmAssignmentPolicy({
    actor,
    capability: PATIENT_ASSIGN_OSM_CAPABILITY,
    targetHospitalId: relationship.hospitalId,
  });
  await assertOwnerInDatabase(transaction, actor.userId, relationship.hospitalId);
  await assertTargetOsmInDatabase(
    transaction,
    actor.userId,
    input.osmUserId,
    relationship.hospitalId,
  );

  const activeAssignment = await resolveActiveAssignment(
    transaction,
    relationship.id,
  );

  if (activeAssignment?.osmUserId === input.osmUserId) {
    return {
      operation: "NOOP",
      patientHospitalRelationshipId: relationship.id,
      hospitalId: relationship.hospitalId,
      assignmentId: activeAssignment.id,
      osmUserId: activeAssignment.osmUserId,
      previousOsmUserId: null,
    };
  }

  if (activeAssignment) {
    await transaction.patientOsmAssignment.update({
      where: { id: activeAssignment.id },
      data: {
        endedAt: now,
        endedByUserId: actor.userId,
      },
    });
  }

  const assignment = await transaction.patientOsmAssignment.create({
    data: {
      patientHospitalRelationshipId: relationship.id,
      osmUserId: input.osmUserId,
      assignedByUserId: actor.userId,
      createdAt: now,
    },
    select: { id: true, osmUserId: true },
  });

  await recordAuditEvent(
    buildPatientOsmAssignedAuditEvent({
      actorUserId: actor.userId,
      assignmentId: assignment.id,
      hospitalId: relationship.hospitalId,
      patientHospitalRelationshipId: relationship.id,
      osmUserId: assignment.osmUserId,
      previousOsmUserId: activeAssignment?.osmUserId,
    }),
    transaction,
  );

  if (activeAssignment) {
    await handoffFutureAppointments(transaction, {
      actorUserId: actor.userId,
      hospitalId: relationship.hospitalId,
      patientHospitalRelationshipId: relationship.id,
      patientUserId: relationship.patientUserId,
      previousOsmUserId: activeAssignment.osmUserId,
      nextOsmUserId: assignment.osmUserId,
      now,
    });
  }

  return {
    operation: activeAssignment ? "REASSIGNED" : "ASSIGNED",
    patientHospitalRelationshipId: relationship.id,
    hospitalId: relationship.hospitalId,
    assignmentId: assignment.id,
    osmUserId: assignment.osmUserId,
    previousOsmUserId: activeAssignment?.osmUserId ?? null,
  };
}

export async function unassignOsmFromPatientInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientOsmUnassignmentRequest,
  now: Date,
): Promise<PatientOsmAssignmentMutationResult> {
  const relationship = await resolvePatientHospitalRelationship(
    transaction,
    input.patientHospitalRelationshipId,
  );

  assertPatientOsmAssignmentPolicy({
    actor,
    capability: PATIENT_ASSIGN_OSM_CAPABILITY,
    targetHospitalId: relationship.hospitalId,
  });
  await assertOwnerInDatabase(transaction, actor.userId, relationship.hospitalId);

  const activeAssignment = await resolveActiveAssignment(
    transaction,
    relationship.id,
  );

  if (!activeAssignment) {
    return {
      operation: "NOOP",
      patientHospitalRelationshipId: relationship.id,
      hospitalId: relationship.hospitalId,
      assignmentId: null,
      osmUserId: null,
      previousOsmUserId: null,
    };
  }

  await transaction.patientOsmAssignment.update({
    where: { id: activeAssignment.id },
    data: {
      endedAt: now,
      endedByUserId: actor.userId,
    },
  });

  await handoffFutureAppointments(transaction, {
    actorUserId: actor.userId,
    hospitalId: relationship.hospitalId,
    patientHospitalRelationshipId: relationship.id,
    patientUserId: relationship.patientUserId,
    previousOsmUserId: activeAssignment.osmUserId,
    nextOsmUserId: null,
    now,
  });

  await recordAuditEvent(
    {
      actorUserId: actor.userId,
      action: "patient.osm_unassigned",
      resourceType: "PatientOsmAssignment",
      resourceId: activeAssignment.id,
      metadata: {
        hospitalId: relationship.hospitalId,
        patientHospitalRelationshipId: relationship.id,
        osmUserId: activeAssignment.osmUserId,
      },
    },
    transaction,
  );

  return {
    operation: "UNASSIGNED",
    patientHospitalRelationshipId: relationship.id,
    hospitalId: relationship.hospitalId,
    assignmentId: null,
    osmUserId: null,
    previousOsmUserId: activeAssignment.osmUserId,
  };
}

export const patientOsmAssignmentTransactionInternals = {
  assertOwnerInDatabase,
  assertTargetOsmInDatabase,
  resolveActiveAssignment,
  resolvePatientHospitalRelationship,
};
