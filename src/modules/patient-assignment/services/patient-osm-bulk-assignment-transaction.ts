import "server-only";

import { HospitalStatus, Prisma, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  assertPatientOsmAssignmentPolicy,
  PATIENT_ASSIGN_OSM_CAPABILITY,
} from "../policies/patient-osm-assignment-policy";
import type { PatientOsmBulkAssignmentRequest } from "../schemas/patient-osm-assignment-schemas";
import {
  assignOsmToPatientInTransaction,
  patientOsmAssignmentTransactionInternals,
} from "./patient-osm-assignment-transaction";

export const PATIENT_OSM_BULK_ASSIGNMENT_AUDIT_ACTION = "patient.osm_bulk_assigned" as const;
export const PATIENT_OSM_BULK_ASSIGNMENT_RESOURCE_TYPE = "PatientOsmBulkAssignment" as const;

export type PatientOsmBulkAssignmentOperation = "ASSIGNED" | "REPLAYED";

export type PatientOsmBulkAssignmentResult = {
  operation: PatientOsmBulkAssignmentOperation;
  hospitalId: string;
  osmUserId: string;
  assignedCount: number;
};

function readReplayMetadata(metadata: Prisma.JsonValue | null): {
  hospitalId: string;
  osmUserId: string;
  assignedCount: number;
} | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const { hospitalId, osmUserId, assignedCount } = metadata;

  return typeof hospitalId === "string" &&
    typeof osmUserId === "string" &&
    typeof assignedCount === "number"
    ? { hospitalId, osmUserId, assignedCount }
    : null;
}

/**
 * Assigns one OSM to many patients of one Hospital, all-or-nothing. Authorization is
 * exactly the single-patient policy and is re-checked for every patient by
 * `assignOsmToPatientInTransaction`. A patient that already has a current OSM is
 * rejected (reassignment stays a per-patient decision). The submission nonce is
 * recorded as an audit marker so a repeated submit is replayed, never re-applied.
 */
export async function assignOsmToPatientsInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: PatientOsmBulkAssignmentRequest,
  now: Date,
): Promise<PatientOsmBulkAssignmentResult> {
  assertPatientOsmAssignmentPolicy({
    actor,
    capability: PATIENT_ASSIGN_OSM_CAPABILITY,
    targetHospitalId: input.hospitalId,
  });
  await patientOsmAssignmentTransactionInternals.assertOwnerInDatabase(
    transaction,
    actor.userId,
    input.hospitalId,
  );
  await patientOsmAssignmentTransactionInternals.assertTargetOsmInDatabase(
    transaction,
    actor.userId,
    input.osmUserId,
    input.hospitalId,
  );

  const previous = await transaction.auditEvent.findFirst({
    where: {
      action: PATIENT_OSM_BULK_ASSIGNMENT_AUDIT_ACTION,
      resourceType: PATIENT_OSM_BULK_ASSIGNMENT_RESOURCE_TYPE,
      resourceId: input.submissionNonce,
    },
    select: { actorUserId: true, metadata: true },
  });

  if (previous) {
    const replay = readReplayMetadata(previous.metadata);

    if (
      previous.actorUserId !== actor.userId ||
      !replay ||
      replay.hospitalId !== input.hospitalId ||
      replay.osmUserId !== input.osmUserId
    ) {
      throw new ConflictError("The bulk assignment submission conflicts with another request");
    }

    return { operation: "REPLAYED", ...replay };
  }

  const relationships = await transaction.patientHospitalRelationship.findMany({
    where: {
      id: { in: input.patientHospitalRelationshipIds },
      hospital: { status: HospitalStatus.ACTIVE },
      patientProfile: { person: { user: { roles: { some: { role: Role.PATIENT } } } } },
    },
    select: {
      id: true,
      hospitalId: true,
      osmAssignments: { where: { endedAt: null }, select: { id: true }, take: 1 },
    },
  });

  if (relationships.length !== input.patientHospitalRelationshipIds.length) {
    throw new NotFoundError();
  }

  if (relationships.some(({ hospitalId }) => hospitalId !== input.hospitalId)) {
    throw new ForbiddenError();
  }

  if (relationships.some(({ osmAssignments }) => osmAssignments.length > 0)) {
    throw new ConflictError("A selected patient already has a current OSM");
  }

  for (const patientHospitalRelationshipId of [...input.patientHospitalRelationshipIds].sort()) {
    const result = await assignOsmToPatientInTransaction(
      transaction,
      actor,
      { patientHospitalRelationshipId, osmUserId: input.osmUserId },
      now,
    );

    if (result.operation !== "ASSIGNED" || result.hospitalId !== input.hospitalId) {
      throw new ConflictError("The patient assignment changed during the bulk assignment");
    }
  }

  await recordAuditEvent(
    {
      actorUserId: actor.userId,
      action: PATIENT_OSM_BULK_ASSIGNMENT_AUDIT_ACTION,
      resourceType: PATIENT_OSM_BULK_ASSIGNMENT_RESOURCE_TYPE,
      resourceId: input.submissionNonce,
      metadata: {
        hospitalId: input.hospitalId,
        osmUserId: input.osmUserId,
        assignedCount: input.patientHospitalRelationshipIds.length,
      },
    },
    transaction,
  );

  return {
    operation: "ASSIGNED",
    hospitalId: input.hospitalId,
    osmUserId: input.osmUserId,
    assignedCount: input.patientHospitalRelationshipIds.length,
  };
}
