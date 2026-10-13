import "server-only";

import { createHash } from "node:crypto";

import { HospitalStatus, Prisma, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvents } from "@/modules/audit/services/audit-service";
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
  buildPatientOsmAssignedAuditEvent,
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

type ReplayMetadata = {
  hospitalId: string;
  osmUserId: string;
  assignedCount: number;
  selectionFingerprint: string;
};

const SELECTION_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

/** SHA-256 of the sorted patient relationship ids: the same set always yields the same value. */
function fingerprintPatientSelection(patientHospitalRelationshipIds: readonly string[]): string {
  return createHash("sha256")
    .update([...patientHospitalRelationshipIds].sort().join(","))
    .digest("hex");
}

function readReplayMetadata(metadata: Prisma.JsonValue | null): ReplayMetadata | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const { hospitalId, osmUserId, assignedCount, selectionFingerprint } = metadata;

  return typeof hospitalId === "string" &&
    typeof osmUserId === "string" &&
    typeof assignedCount === "number" &&
    Number.isInteger(assignedCount) &&
    typeof selectionFingerprint === "string" &&
    SELECTION_FINGERPRINT_PATTERN.test(selectionFingerprint)
    ? { hospitalId, osmUserId, assignedCount, selectionFingerprint }
    : null;
}

/**
 * Assigns one OSM to many patients of one Hospital, all-or-nothing. Authorization is
 * the single-patient policy and owner / OSM-eligibility checks, evaluated once for the
 * batch (they are identical for every patient of one hospital), plus one set-based
 * check that every selected relationship is an active patient of that hospital. A
 * patient that already has a current OSM is rejected (reassignment stays a per-patient
 * decision). The submission nonce is recorded as an audit marker together with a
 * fingerprint of the selection, so only the identical request is replayed.
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

  const selectionFingerprint = fingerprintPatientSelection(input.patientHospitalRelationshipIds);

  if (previous) {
    const replay = readReplayMetadata(previous.metadata);

    if (
      previous.actorUserId !== actor.userId ||
      !replay ||
      replay.hospitalId !== input.hospitalId ||
      replay.osmUserId !== input.osmUserId ||
      replay.assignedCount !== input.patientHospitalRelationshipIds.length ||
      replay.selectionFingerprint !== selectionFingerprint
    ) {
      throw new ConflictError("The bulk assignment submission conflicts with another request");
    }

    return { operation: "REPLAYED", hospitalId: replay.hospitalId, osmUserId: replay.osmUserId, assignedCount: replay.assignedCount };
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

  const created = await transaction.patientOsmAssignment.createManyAndReturn({
    data: [...input.patientHospitalRelationshipIds].sort().map((patientHospitalRelationshipId) => ({
      patientHospitalRelationshipId,
      osmUserId: input.osmUserId,
      assignedByUserId: actor.userId,
      createdAt: now,
    })),
    select: { id: true, patientHospitalRelationshipId: true },
  });

  if (created.length !== input.patientHospitalRelationshipIds.length) {
    throw new ConflictError("The patient assignment changed during the bulk assignment");
  }

  await recordAuditEvents(
    [
      ...created.map(({ id, patientHospitalRelationshipId }) =>
        buildPatientOsmAssignedAuditEvent({
          actorUserId: actor.userId,
          assignmentId: id,
          hospitalId: input.hospitalId,
          patientHospitalRelationshipId,
          osmUserId: input.osmUserId,
        }),
      ),
      {
        actorUserId: actor.userId,
        action: PATIENT_OSM_BULK_ASSIGNMENT_AUDIT_ACTION,
        resourceType: PATIENT_OSM_BULK_ASSIGNMENT_RESOURCE_TYPE,
        resourceId: input.submissionNonce,
        metadata: {
          hospitalId: input.hospitalId,
          osmUserId: input.osmUserId,
          assignedCount: created.length,
          selectionFingerprint,
        },
      },
    ],
    transaction,
  );

  return {
    operation: "ASSIGNED",
    hospitalId: input.hospitalId,
    osmUserId: input.osmUserId,
    assignedCount: created.length,
  };
}

export const patientOsmBulkAssignmentInternals = { fingerprintPatientSelection, readReplayMetadata };
