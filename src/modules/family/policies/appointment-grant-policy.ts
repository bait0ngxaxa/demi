import "server-only";

import { Prisma, Role } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import { FAMILY_APPOINTMENT_READ_CONTRACTS } from "../domain/appointment-grant-contract";

export function appointmentGrantOwnerWhere(actor: ActorContext): Prisma.CaregiverAppointmentGrantWhereInput {
  return {
    proposedByUserId: actor.userId,
    patientPersonId: actor.personId,
    patientProfile: { is: { personId: actor.personId, person: { is: {
      user: { is: { id: actor.userId, personId: actor.personId, status: "ACTIVE", roles: { some: { role: Role.PATIENT } } } },
    } } } },
  };
}

/**
 * Purpose-specific current authority. No role/membership fallback. Exact pairs are also DB-bound. Phase F: a grant
 * through an ended Patient-Hospital relationship gives no caregiver authority (the grant row itself is retained).
 */
export function appointmentGrantCaregiverWhere(
  actor: ActorContext,
  status: "PENDING" | "ACTIVE",
): Prisma.CaregiverAppointmentGrantWhereInput {
  return {
    contractVersion: { in: [...FAMILY_APPOINTMENT_READ_CONTRACTS] },
    status,
    ...(status === "ACTIVE" ? { acceptedByUserId: actor.userId, acceptedAt: { not: null }, revokedAt: null } : {}),
    caregiverUserId: actor.userId,
    caregiverPersonId: actor.personId,
    caregiverUser: { is: { id: actor.userId, personId: actor.personId, status: "ACTIVE" } },
    proposedByUser: { is: { status: "ACTIVE", roles: { some: { role: Role.PATIENT } } } },
    caregiverRelationship: { is: {
      status: "ACTIVE",
      caregiverUserId: actor.userId,
      sourceInvitation: { is: {
        status: "ACCEPTED", caregiverUserId: actor.userId, caregiverPersonId: actor.personId,
        acceptanceContractVersion: "family-delegation-v1",
      } },
    } },
    patientHospitalRelationship: { is: { ...activePatientHospitalRelationshipWhere, hospital: { is: { status: "ACTIVE" } } } },
  };
}
