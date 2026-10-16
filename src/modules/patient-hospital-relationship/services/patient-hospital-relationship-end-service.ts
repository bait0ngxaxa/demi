import "server-only";

import {
  AppointmentCancellationRequestStatus,
  AppointmentStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientServiceRequestStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  activePatientHospitalRelationshipWhere,
  isPatientHospitalRelationshipEnded,
} from "../domain/patient-hospital-relationship-lifecycle";
import {
  patientHospitalRelationshipEndSchema,
  patientHospitalRelationshipIdSchema,
} from "../schemas/patient-hospital-relationship-end-schemas";

export type PatientHospitalRelationshipEndDependencies = {
  database?: PrismaClient;
  now?: () => Date;
};

export type PatientHospitalRelationshipEndResult = {
  relationshipId: string;
  hospitalId: string;
  endedAt: Date;
  osmAssignmentsEnded: number;
  appointmentsCancelled: number;
  appointmentRequestsClosed: number;
  serviceRequestsClosed: number;
  activationsRevoked: number;
};

export type PatientHospitalRelationshipEndStatus = "ACTIVE" | "ENDED";

/** Same database proof as other OWNER actions: an ACTIVE HOSPITAL User owning the exact ACTIVE Hospital. */
async function isActiveOwnerOfHospital(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  hospitalId: string,
): Promise<boolean> {
  if (!actor.roles.includes(Role.HOSPITAL)) return false;
  const owner = await transaction.user.findFirst({
    where: {
      id: actor.userId,
      personId: actor.personId,
      status: UserStatus.ACTIVE,
      roles: { some: { role: Role.HOSPITAL } },
      memberships: {
        some: {
          hospitalId,
          membershipType: MembershipType.OWNER,
          status: MembershipStatus.ACTIVE,
          hospital: { is: { status: HospitalStatus.ACTIVE } },
        },
      },
    },
    select: { id: true },
  });
  return owner !== null;
}

/** Returns only the current lifecycle state to the persisted OWNER of this exact ACTIVE Hospital. */
export async function getPatientHospitalRelationshipEndStatus(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientHospitalRelationshipEndDependencies = {},
): Promise<PatientHospitalRelationshipEndStatus> {
  if (!actor) throw new ForbiddenError();
  const parsedRelationshipId = patientHospitalRelationshipIdSchema.safeParse(relationshipId);
  if (!parsedRelationshipId.success) throw new NotFoundError();

  try {
    return await (dependencies.database ?? getPrisma()).$transaction(async (transaction) => {
      const relationship = await transaction.patientHospitalRelationship.findUnique({
        where: { id: parsedRelationshipId.data },
        select: { hospitalId: true, endedAt: true },
      });
      if (!relationship || !(await isActiveOwnerOfHospital(transaction, actor, relationship.hospitalId))) {
        throw new NotFoundError();
      }

      return relationship.endedAt === null ? "ACTIVE" : "ENDED";
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Patient care relationship status could not be verified");
  }
}

/**
 * Phase F (ก-18) "ลบผู้ใช้งานทั่วไป": the OWNER of the exact ACTIVE Hospital ends the Patient's care relationship with
 * that Hospital. Nothing is deleted: programs, rounds, follow-ups, appointments, evidence and audit stay attributable
 * to the relationship. In one transaction the relationship is marked ended, the current OSM assignment ends, future
 * appointments are cancelled (no LINE message), open appointment/service requests close and this Hospital's pending
 * activation is revoked. The Patient account and other Hospital relationships are untouched; ending is terminal.
 */
export async function endPatientHospitalRelationship(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientHospitalRelationshipEndDependencies = {},
): Promise<PatientHospitalRelationshipEndResult> {
  if (!actor) throw new ForbiddenError();
  const parsed = patientHospitalRelationshipEndSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Patient care end data is invalid");
  const { relationshipId, endReason } = parsed.data;

  try {
    return await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const relationship = await transaction.patientHospitalRelationship.findUnique({
        where: { id: relationshipId },
        select: {
          id: true,
          hospitalId: true,
          endedAt: true,
          patientProfile: { select: { person: { select: { user: { select: { id: true } } } } } },
        },
      });
      // Unknown and other-Hospital relationships look the same to a non-owner (no existence oracle).
      if (!relationship || !(await isActiveOwnerOfHospital(transaction, actor, relationship.hospitalId))) {
        throw new NotFoundError();
      }
      if (isPatientHospitalRelationshipEnded(relationship)) {
        throw new ConflictError("Patient care relationship has already ended");
      }

      const now = dependencies.now?.() ?? new Date();
      const ended = await transaction.patientHospitalRelationship.updateMany({
        where: { id: relationship.id, ...activePatientHospitalRelationshipWhere },
        data: { endedAt: now, endedByUserId: actor.userId, endReason },
      });
      if (ended.count !== 1) throw new ConflictError("Patient care relationship changed");

      const osmAssignments = await transaction.patientOsmAssignment.updateMany({
        where: { patientHospitalRelationshipId: relationship.id, endedAt: null },
        data: { endedAt: now, endedByUserId: actor.userId },
      });

      // Existing cancellation semantics (status CANCELLED, updatedAt bump, audit per appointment) without the LINE
      // intent: notifications for an ended relationship stop.
      const futureAppointments = await transaction.patientAppointment.findMany({
        where: {
          patientHospitalRelationshipId: relationship.id,
          status: AppointmentStatus.SCHEDULED,
          scheduledAt: { gte: now },
        },
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
        select: { id: true, updatedAt: true },
      });
      for (const appointment of futureAppointments) {
        const cancelled = await transaction.patientAppointment.updateMany({
          where: { id: appointment.id, status: AppointmentStatus.SCHEDULED, updatedAt: appointment.updatedAt },
          data: {
            status: AppointmentStatus.CANCELLED,
            updatedAt: new Date(Math.max(appointment.updatedAt.getTime() + 1, now.getTime())),
          },
        });
        if (cancelled.count !== 1) throw new ConflictError("An Appointment changed while care was ending");
        await recordAuditEvent({
          actorUserId: actor.userId,
          action: "appointment.cancelled",
          resourceType: "PatientAppointment",
          resourceId: appointment.id,
          metadata: {
            appointmentId: appointment.id,
            patientHospitalRelationshipId: relationship.id,
            hospitalId: relationship.hospitalId,
            fromStatus: AppointmentStatus.SCHEDULED,
            toStatus: AppointmentStatus.CANCELLED,
            cause: "PATIENT_HOSPITAL_RELATIONSHIP_ENDED",
          },
        }, transaction);
      }

      const openRequestWhere = {
        status: AppointmentCancellationRequestStatus.PENDING,
        appointment: { is: { patientHospitalRelationshipId: relationship.id } },
      };
      const closedRequestData = {
        status: AppointmentCancellationRequestStatus.SUPERSEDED,
        resolvedByUserId: actor.userId,
        resolvedAt: now,
      };
      const [rescheduleRequests, cancellationRequests] = await Promise.all([
        transaction.patientAppointmentRescheduleRequest.updateMany({ where: openRequestWhere, data: closedRequestData }),
        transaction.patientAppointmentCancellationRequest.updateMany({ where: openRequestWhere, data: closedRequestData }),
      ]);

      // A Hospital closing an open request is a rejection by that Hospital.
      const serviceRequests = await transaction.patientServiceRequest.updateMany({
        where: {
          patientHospitalRelationshipId: relationship.id,
          status: { in: [PatientServiceRequestStatus.PENDING, PatientServiceRequestStatus.APPROVED] },
        },
        data: { status: PatientServiceRequestStatus.REJECTED, reviewedByUserId: actor.userId, reviewedAt: now },
      });

      const patientUserId = relationship.patientProfile.person.user?.id ?? null;
      const activations = patientUserId
        ? await transaction.patientActivation.updateMany({
            where: {
              userId: patientUserId,
              hospitalId: relationship.hospitalId,
              claimedAt: null,
              usedAt: null,
              revokedAt: null,
              reconciliationRequiredAt: null,
            },
            data: { revokedAt: now, claimExpiresAt: null, patientAccessRequestId: null },
          })
        : { count: 0 };

      const result: PatientHospitalRelationshipEndResult = {
        relationshipId: relationship.id,
        hospitalId: relationship.hospitalId,
        endedAt: now,
        osmAssignmentsEnded: osmAssignments.count,
        appointmentsCancelled: futureAppointments.length,
        appointmentRequestsClosed: rescheduleRequests.count + cancellationRequests.count,
        serviceRequestsClosed: serviceRequests.count,
        activationsRevoked: activations.count,
      };

      // The free-text reason is stored on the relationship row, not copied into audit metadata.
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "patient.hospital_relationship.ended",
        resourceType: "PatientHospitalRelationship",
        resourceId: relationship.id,
        metadata: {
          basis: "HOSPITAL_OWNER",
          hospitalId: relationship.hospitalId,
          endedAt: now.toISOString(),
          osmAssignmentsEnded: result.osmAssignmentsEnded,
          appointmentsCancelled: result.appointmentsCancelled,
          appointmentRequestsClosed: result.appointmentRequestsClosed,
          serviceRequestsClosed: result.serviceRequestsClosed,
          activationsRevoked: result.activationsRevoked,
        },
      }, transaction);

      return result;
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      throw new ConflictError("Patient care relationship changed");
    }
    throw new InfrastructureError("Patient care relationship could not be ended");
  }
}
