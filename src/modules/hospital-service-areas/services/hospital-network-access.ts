import "server-only";

import {
  HospitalServiceAreaFacilityKind,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ForbiddenError } from "@/shared/errors/application-error";

/**
 * ADR-0015/0016: the active operational network is the only source of cross-Hospital authority.
 * Canonical `parentHospitalId` is never consulted here. Every predicate is persisted-state SQL,
 * evaluated per request; nothing here trusts client-supplied membership context.
 */
export type HospitalNetworkDatabase = PrismaClient | Prisma.TransactionClient;

/**
 * OWNER: Parent OWNER only (area management, Parent summary reports).
 * PATIENT_READ: Parent OWNER, or Parent MEMBER holding the OWNER-issued network Patient read grant.
 */
export type HospitalNetworkAuthority = "OWNER" | "PATIENT_READ";

export type HospitalNetworkFacility = { id: string; hospitalCode: string; name: string };
export type HospitalNetworkScope = { parent: HospitalNetworkFacility; children: HospitalNetworkFacility[] };

const facilitySelect = { id: true, hospitalCode: true, name: true } satisfies Prisma.HospitalSelect;

function networkMembershipWhere(
  actorUserId: string,
  authority: HospitalNetworkAuthority,
): Prisma.HospitalMembershipWhereInput {
  return {
    userId: actorUserId,
    status: MembershipStatus.ACTIVE,
    user: { is: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } },
    OR: authority === "OWNER"
      ? [{ membershipType: MembershipType.OWNER }]
      : [
          { membershipType: MembershipType.OWNER },
          { membershipType: MembershipType.MEMBER, networkPatientReadGrantedAt: { not: null } },
        ],
  };
}

export function buildNetworkParentHospitalWhere(
  actorUserId: string,
  authority: HospitalNetworkAuthority,
): Prisma.HospitalWhereInput {
  return {
    status: HospitalStatus.ACTIVE,
    serviceAreaEligibility: { is: { kind: HospitalServiceAreaFacilityKind.PARENT } },
    memberships: { some: networkMembershipWhere(actorUserId, authority) },
  };
}

const activeChildWhere = {
  status: HospitalStatus.ACTIVE,
  serviceAreaEligibility: { is: { kind: HospitalServiceAreaFacilityKind.CHILD } },
} satisfies Prisma.HospitalWhereInput;

/** Child Hospitals whose Patients the actor may read (read-only) through an active network association. */
export function buildNetworkReadableChildHospitalWhere(actorUserId: string): Prisma.HospitalWhereInput {
  return {
    ...activeChildWhere,
    serviceAreaAssignments: {
      some: { endedAt: null, parent: { is: buildNetworkParentHospitalWhere(actorUserId, "PATIENT_READ") } },
    },
  };
}

/** Exact active Child of an exact Parent the actor holds `authority` over, or null. */
export async function findNetworkChild(
  database: HospitalNetworkDatabase,
  actorUserId: string,
  parentHospitalId: string,
  childHospitalId: string,
  authority: HospitalNetworkAuthority,
): Promise<{ parent: HospitalNetworkFacility; child: HospitalNetworkFacility } | null> {
  const area = await database.hospitalServiceArea.findFirst({
    where: {
      parentHospitalId,
      childHospitalId,
      endedAt: null,
      parent: { is: buildNetworkParentHospitalWhere(actorUserId, authority) },
      child: { is: activeChildWhere },
    },
    select: { parent: { select: facilitySelect }, child: { select: facilitySelect } },
  });
  return area ?? null;
}

/** The Parent through which the actor may read this Child's Patients, or null. One active Parent per Child. */
export async function findNetworkPatientReadParent(
  database: HospitalNetworkDatabase,
  actorUserId: string,
  childHospitalId: string,
): Promise<HospitalNetworkFacility | null> {
  const area = await database.hospitalServiceArea.findFirst({
    where: {
      childHospitalId,
      endedAt: null,
      parent: { is: buildNetworkParentHospitalWhere(actorUserId, "PATIENT_READ") },
      child: { is: activeChildWhere },
    },
    select: { parent: { select: facilitySelect } },
  });
  return area?.parent ?? null;
}

/** Every Parent the actor holds `authority` over, with its active Children (name order). */
export async function listNetworkScopes(
  database: HospitalNetworkDatabase,
  actorUserId: string,
  authority: HospitalNetworkAuthority,
): Promise<HospitalNetworkScope[]> {
  const parents = await database.hospital.findMany({
    where: buildNetworkParentHospitalWhere(actorUserId, authority),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      ...facilitySelect,
      managedServiceAreas: {
        where: { endedAt: null, child: { is: activeChildWhere } },
        select: { child: { select: facilitySelect } },
      },
    },
  });
  return parents.map(({ managedServiceAreas, ...parent }) => ({
    parent,
    children: managedServiceAreas
      .map(({ child }) => child)
      .sort((left, right) => left.name.localeCompare(right.name, "th") || left.id.localeCompare(right.id)),
  }));
}

/**
 * ADR-0016 read-only fallback for Patient read resolvers. The direct policy always runs first; only when it
 * denies a READ capability does the persisted network grant apply, and every such read is audited.
 * Write capabilities never reach the network path, so network readers can never mutate Child data.
 */
export async function assertDirectOrNetworkPatientRead(
  assertDirect: () => void,
  isReadCapability: boolean,
  database: HospitalNetworkDatabase,
  input: { actorUserId: string; childHospitalId: string; patientHospitalRelationshipId: string; scope: string },
): Promise<"DIRECT" | "NETWORK"> {
  try {
    assertDirect();
    return "DIRECT";
  } catch (error: unknown) {
    if (!(error instanceof ForbiddenError) || !isReadCapability) throw error;
  }
  const parent = await findNetworkPatientReadParent(database, input.actorUserId, input.childHospitalId);
  if (!parent) throw new ForbiddenError();
  await recordNetworkPatientRead(database, {
    actorUserId: input.actorUserId,
    parentHospitalId: parent.id,
    childHospitalId: input.childHospitalId,
    resourceType: "PatientHospitalRelationship",
    resourceId: input.patientHospitalRelationshipId,
    scope: input.scope,
  });
  return "NETWORK";
}

/** Every network Patient read is audited with the granting Parent; failure aborts the read. */
export async function recordNetworkPatientRead(
  database: HospitalNetworkDatabase,
  input: {
    actorUserId: string;
    parentHospitalId: string;
    childHospitalId: string;
    resourceType: "PatientHospitalRelationship" | "Hospital";
    resourceId: string;
    scope: string;
  },
): Promise<void> {
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: "patient.network_read",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: { parentHospitalId: input.parentHospitalId, childHospitalId: input.childHospitalId, scope: input.scope },
  }, database);
}
