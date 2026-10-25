import "server-only";

import { CaregiverRelationshipStatus, Prisma, Role, UserStatus, type CaregiverRelationshipLabel } from "@prisma/client";

import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import { ConflictError } from "@/shared/errors/application-error";

import { FAMILY_APPOINTMENT_READ_CONTRACT_V2 } from "../domain/appointment-grant-contract";
import { CAREGIVER_RESOURCE_CONTRACTS } from "../domain/caregiver-sharing-contract";
import {
  caregiverInvitationRequestedScopesSchema,
  type CaregiverInvitationRequestedScopes,
} from "../schemas/caregiver-relationship-schemas";

export const EMPTY_REQUESTED_SCOPES: CaregiverInvitationRequestedScopes = { appointmentRelationshipIds: [], resources: [] };

/** Invitations issued before AF-5 have no scopes; a stored value that no longer parses is rejected, never guessed. */
export function parseRequestedScopes(value: Prisma.JsonValue | null): CaregiverInvitationRequestedScopes | null {
  if (value === null) return EMPTY_REQUESTED_SCOPES;
  const parsed = caregiverInvitationRequestedScopesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type ActivatableInvitation = {
  id: string;
  patientProfileId: string;
  issuedByUserId: string;
  issuedAt: Date;
  requestedRelationshipLabel: CaregiverRelationshipLabel | null;
  requestedRelationshipLabelOther: string | null;
  requestedScopes: Prisma.JsonValue | null;
};

export const activatableInvitationSelect = {
  id: true,
  patientProfileId: true,
  issuedByUserId: true,
  issuedAt: true,
  requestedRelationshipLabel: true,
  requestedRelationshipLabelOther: true,
  requestedScopes: true,
} satisfies Prisma.CaregiverInvitationSelect;

const SCOPE_UNAVAILABLE = "The requested caregiver sharing is no longer available";

/**
 * AF-5 one-step add, inside the caller's acceptance transaction: creates the relationship with the requested label
 * and every requested grant as already accepted. Each scope is re-authorized against current state (Patient still
 * an ACTIVE PATIENT, Hospital relationship still ongoing). Any failure throws, so the caller's
 * transaction rolls back and nothing is created.
 */
export async function activateCaregiverRelationship(
  transaction: Prisma.TransactionClient,
  input: {
    invitation: ActivatableInvitation;
    caregiver: { userId: string; personId: string };
    acceptedAt: Date;
  },
): Promise<{ relationshipId: string }> {
  const { invitation, caregiver, acceptedAt } = input;
  const scopes = parseRequestedScopes(invitation.requestedScopes);
  if (!scopes) throw new ConflictError(SCOPE_UNAVAILABLE);
  const hasScopes = scopes.appointmentRelationshipIds.length > 0 || scopes.resources.length > 0;

  let patientPersonId: string | null = null;
  if (hasScopes) {
    const patient = await transaction.patientProfile.findFirst({
      where: { id: invitation.patientProfileId, person: { is: { user: { is: {
        id: invitation.issuedByUserId, status: UserStatus.ACTIVE, roles: { some: { role: Role.PATIENT } },
      } } } } },
      select: { personId: true },
    });
    if (!patient) throw new ConflictError(SCOPE_UNAVAILABLE);
    patientPersonId = patient.personId;
  }

  if (scopes.appointmentRelationshipIds.length > 0) {
    const ongoing = await transaction.patientHospitalRelationship.count({
      where: {
        id: { in: scopes.appointmentRelationshipIds }, patientProfileId: invitation.patientProfileId,
        ...activePatientHospitalRelationshipWhere, hospital: { is: { status: "ACTIVE" } },
      },
    });
    if (ongoing !== scopes.appointmentRelationshipIds.length) throw new ConflictError(SCOPE_UNAVAILABLE);
  }

  const relationship = await transaction.caregiverRelationship.create({
    data: {
      patientProfileId: invitation.patientProfileId,
      caregiverUserId: caregiver.userId,
      sourceInvitationId: invitation.id,
      status: CaregiverRelationshipStatus.ACTIVE,
      activatedAt: acceptedAt,
      relationshipLabel: invitation.requestedRelationshipLabel,
      relationshipLabelOther: invitation.requestedRelationshipLabelOther,
    },
    select: { id: true },
  });

  if (patientPersonId === null) return { relationshipId: relationship.id };
  const lifecycle = {
    caregiverRelationshipId: relationship.id,
    patientProfileId: invitation.patientProfileId,
    patientPersonId,
    caregiverUserId: caregiver.userId,
    caregiverPersonId: caregiver.personId,
    status: "ACTIVE" as const,
    proposedByUserId: invitation.issuedByUserId,
    proposedAt: invitation.issuedAt,
    acceptedByUserId: caregiver.userId,
    acceptedAt,
  };

  for (const patientHospitalRelationshipId of scopes.appointmentRelationshipIds) {
    const grant = await transaction.caregiverAppointmentGrant.create({
      data: { ...lifecycle, patientHospitalRelationshipId, contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT_V2 },
      select: { id: true },
    });
    await recordAuditEvent({
      actorUserId: caregiver.userId, action: "caregiver_appointment_grant.accepted", resourceType: "caregiver_appointment_grant",
      resourceId: grant.id, metadata: { contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT_V2, source: "INVITATION" },
    }, transaction);
  }
  for (const resource of scopes.resources) {
    const contractVersion = CAREGIVER_RESOURCE_CONTRACTS[resource];
    const grant = await transaction.caregiverResourceGrant.create({
      data: { ...lifecycle, resource, contractVersion },
      select: { id: true },
    });
    await recordAuditEvent({
      actorUserId: caregiver.userId, action: "caregiver_resource_grant.accepted", resourceType: "caregiver_resource_grant",
      resourceId: grant.id, metadata: { resource, contractVersion, source: "INVITATION" },
    }, transaction);
  }

  return { relationshipId: relationship.id };
}
