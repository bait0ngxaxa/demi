import "server-only";

import { Prisma, Role, type CaregiverResource, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { CAREGIVER_RESOURCE_CONTRACTS } from "../domain/caregiver-sharing-contract";
import { assertFamilyAuthenticatedActor, assertFamilyPatientSelf } from "../policies/caregiver-relationship-policy";
import { resourceGrantCaregiverWhere, resourceGrantOwnerWhere } from "../policies/resource-grant-policy";
import { proposeResourceGrantInputSchema, resourceGrantIdSchema } from "../schemas/caregiver-relationship-schemas";
import { appointmentGrantNow, rethrowAppointmentGrantError } from "./appointment-grant-service";

export type ResourceGrantDependencies = { database?: PrismaClient; now?: () => Date };

export function availableCaregiverResources(): CaregiverResource[] {
  return Object.keys(CAREGIVER_RESOURCE_CONTRACTS) as CaregiverResource[];
}

export async function proposeResourceGrant(
  actor: ActorContext | null | undefined, input: unknown, dependencies: ResourceGrantDependencies = {},
): Promise<{ grantId: string }> {
  assertFamilyPatientSelf(actor);
  const parsed = proposeResourceGrantInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const now = appointmentGrantNow(dependencies);
  try {
    return await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const parent = await transaction.caregiverRelationship.findFirst({
        where: { id: parsed.data.caregiverRelationshipId, status: "ACTIVE", caregiverUser: { is: { status: "ACTIVE" } },
          sourceInvitation: { is: { status: "ACCEPTED", acceptanceContractVersion: "family-delegation-v1" } },
          patientProfile: { is: { personId: actor.personId, person: { is: { user: { is: {
            id: actor.userId, personId: actor.personId, status: "ACTIVE", roles: { some: { role: Role.PATIENT } },
          } } } } } } },
        select: { id: true, patientProfileId: true, caregiverUserId: true, caregiverUser: { select: { personId: true } },
          sourceInvitation: { select: { caregiverPersonId: true } } },
      });
      if (!parent || parent.caregiverUser.personId !== parent.sourceInvitation.caregiverPersonId) throw new NotFoundError();
      // The partial unique index also rejects a second actionable grant (mapped to a conflict).
      const contractVersion = CAREGIVER_RESOURCE_CONTRACTS[parsed.data.resource];
      const grant = await transaction.caregiverResourceGrant.create({
        data: { caregiverRelationshipId: parent.id, patientProfileId: parent.patientProfileId, patientPersonId: actor.personId,
          caregiverUserId: parent.caregiverUserId, caregiverPersonId: parent.caregiverUser.personId,
          resource: parsed.data.resource, contractVersion, proposedByUserId: actor.userId, proposedAt: now },
        select: { id: true },
      });
      await recordAuditEvent({ actorUserId: actor.userId, action: "caregiver_resource_grant.proposed", resourceType: "caregiver_resource_grant",
        resourceId: grant.id, metadata: { resource: parsed.data.resource, contractVersion } }, transaction);
      return { grantId: grant.id };
    });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

export async function acceptResourceGrant(
  actor: ActorContext | null | undefined, grantId: unknown, dependencies: ResourceGrantDependencies = {},
): Promise<void> {
  assertFamilyAuthenticatedActor(actor);
  const parsed = resourceGrantIdSchema.safeParse(grantId);
  if (!parsed.success) throw new NotFoundError();
  const now = appointmentGrantNow(dependencies);
  try {
    await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const where = { id: parsed.data, ...resourceGrantCaregiverWhere(actor, "PENDING") };
      const grant = await transaction.caregiverResourceGrant.findFirst({ where, select: { resource: true, contractVersion: true } });
      if (!grant) throw new NotFoundError();
      const changed = await transaction.caregiverResourceGrant.updateMany({
        where, data: { status: "ACTIVE", acceptedByUserId: actor.userId, acceptedAt: now },
      });
      if (changed.count !== 1) throw new NotFoundError();
      await recordAuditEvent({ actorUserId: actor.userId, action: "caregiver_resource_grant.accepted", resourceType: "caregiver_resource_grant",
        resourceId: parsed.data, metadata: { resource: grant.resource, contractVersion: grant.contractVersion } }, transaction);
    });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

/** The Patient may revoke a pending or active resource grant at any time. */
export async function revokeResourceGrant(
  actor: ActorContext | null | undefined, grantId: unknown, dependencies: ResourceGrantDependencies = {},
): Promise<void> {
  assertFamilyPatientSelf(actor);
  const parsed = resourceGrantIdSchema.safeParse(grantId);
  if (!parsed.success) throw new NotFoundError();
  const now = appointmentGrantNow(dependencies);
  try {
    await runSerializableTransaction(dependencies.database ?? getPrisma(), async (transaction) => {
      const where = { id: parsed.data, ...resourceGrantOwnerWhere(actor), status: { in: ["PENDING", "ACTIVE"] as ("PENDING" | "ACTIVE")[] } };
      const grant = await transaction.caregiverResourceGrant.findFirst({ where, select: { status: true, resource: true, contractVersion: true } });
      if (!grant) throw new NotFoundError();
      const changed = await transaction.caregiverResourceGrant.updateMany({ where, data: { status: "REVOKED", revokedByUserId: actor.userId, revokedAt: now } });
      if (changed.count !== 1) throw new NotFoundError();
      await recordAuditEvent({ actorUserId: actor.userId, action: "caregiver_resource_grant.revoked", resourceType: "caregiver_resource_grant",
        resourceId: parsed.data, metadata: { resource: grant.resource, contractVersion: grant.contractVersion, priorStatus: grant.status } }, transaction);
    });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

export type ResourceGrantManagementItem = {
  grantId: string;
  caregiverRelationshipId: string;
  resource: CaregiverResource;
  status: "PENDING" | "ACTIVE";
  proposedAt: Date;
  acceptedAt: Date | null;
  participant: { givenName: string | null; familyName: string | null };
};
export type ResourceGrantManagement = {
  patient: ResourceGrantManagementItem[] | null;
  caregiver: ResourceGrantManagementItem[];
  /** Resources the Patient may propose. */
  availableResources: CaregiverResource[];
};

// Three resources per relationship at most are actionable at once; the bound covers 50 relationships.
const RESOURCE_GRANT_LIST_LIMIT = 150;
const nameSelect = { givenName: true, familyName: true } satisfies Prisma.PersonSelect;
const grantSelect = { id: true, caregiverRelationshipId: true, resource: true, status: true, proposedAt: true, acceptedAt: true } satisfies Prisma.CaregiverResourceGrantSelect;

/** Actionable (PENDING/ACTIVE) resource grants for both ends; null patient part for a non-Patient. */
export async function getResourceGrantManagement(
  actor: ActorContext | null | undefined, dependencies: ResourceGrantDependencies = {},
): Promise<ResourceGrantManagement> {
  assertFamilyAuthenticatedActor(actor);
  try {
    const db = dependencies.database ?? getPrisma();
    const isPatient = actor.roles.includes(Role.PATIENT);
    const [patientRows, caregiverRows] = await Promise.all([
      isPatient ? db.caregiverResourceGrant.findMany({
        where: { ...resourceGrantOwnerWhere(actor), status: { in: ["PENDING", "ACTIVE"] } },
        select: { ...grantSelect, caregiverUser: { select: { person: { select: nameSelect } } } },
        orderBy: [{ proposedAt: "asc" }, { id: "asc" }], take: RESOURCE_GRANT_LIST_LIMIT,
      }) : Promise.resolve(null),
      db.caregiverResourceGrant.findMany({
        where: { OR: [resourceGrantCaregiverWhere(actor, "PENDING"), resourceGrantCaregiverWhere(actor, "ACTIVE")] },
        select: { ...grantSelect, patientProfile: { select: { person: { select: nameSelect } } } },
        orderBy: [{ proposedAt: "asc" }, { id: "asc" }], take: RESOURCE_GRANT_LIST_LIMIT,
      }),
    ]);
    const item = (row: Prisma.CaregiverResourceGrantGetPayload<{ select: typeof grantSelect }>, participant: ResourceGrantManagementItem["participant"]): ResourceGrantManagementItem => ({
      grantId: row.id, caregiverRelationshipId: row.caregiverRelationshipId, resource: row.resource,
      status: row.status === "ACTIVE" ? "ACTIVE" : "PENDING", proposedAt: row.proposedAt, acceptedAt: row.acceptedAt,
      participant: { givenName: participant.givenName, familyName: participant.familyName },
    });
    return {
      patient: patientRows?.map((row) => item(row, row.caregiverUser.person)) ?? null,
      caregiver: caregiverRows.map((row) => item(row, row.patientProfile.person)),
      availableResources: isPatient ? availableCaregiverResources() : [],
    };
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}
