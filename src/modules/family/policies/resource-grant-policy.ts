import "server-only";

import { Prisma, Role, type CaregiverResource } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { CAREGIVER_RESOURCE_CONTRACTS } from "../domain/caregiver-sharing-contract";

export function resourceGrantOwnerWhere(actor: ActorContext): Prisma.CaregiverResourceGrantWhereInput {
  return {
    proposedByUserId: actor.userId,
    patientPersonId: actor.personId,
    patientProfile: { is: { personId: actor.personId, person: { is: {
      user: { is: { id: actor.userId, personId: actor.personId, status: "ACTIVE", roles: { some: { role: Role.PATIENT } } } },
    } } } },
  };
}

/**
 * AF-5: current caregiver authority over one Patient-level resource. Same exact-pair rules as the appointment grant;
 * no role or membership fallback.
 */
export function resourceGrantCaregiverWhere(
  actor: ActorContext,
  status: "PENDING" | "ACTIVE",
  resource?: CaregiverResource,
): Prisma.CaregiverResourceGrantWhereInput {
  return {
    ...(resource
      ? { resource, contractVersion: CAREGIVER_RESOURCE_CONTRACTS[resource] }
      : { OR: Object.entries(CAREGIVER_RESOURCE_CONTRACTS).map(([kind, contractVersion]) => ({ resource: kind as CaregiverResource, contractVersion })) }),
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
  };
}
