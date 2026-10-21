import "server-only";

import {
  HospitalServiceAreaFacilityKind,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  assertHospitalGovernanceCapability,
  HOSPITAL_GOVERNANCE_CAPABILITIES,
} from "@/modules/hospital-governance/policies/hospital-governance-policy";
import {
  assertHospitalOwnerPolicy,
  HOSPITAL_OWNER_CAPABILITIES,
} from "@/modules/workforce/policies/hospital-owner-policy";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

/**
 * Read-only Hospital network structure for reporting and governance screens (ADR-0015/0016). The ADMIN-set
 * network role and the active operational associations are the only source; there is no Master hierarchy.
 */
export type HospitalHierarchyUnit = {
  id: string;
  hospitalCode: string;
  name: string;
  status: HospitalStatus;
};

export type HospitalHierarchyGroup = {
  mainHospital: HospitalHierarchyUnit;
  directChildren: readonly HospitalHierarchyUnit[];
};

export type HospitalHierarchyDirectory = {
  hospitalCount: number;
  mainHospitalCount: number;
  subordinateHospitalCount: number;
  groups: readonly HospitalHierarchyGroup[];
  /** Hospitals in no network group: without a network role, or a Child without an active Parent. */
  outsideNetwork: readonly HospitalHierarchyUnit[];
};

export type HospitalNetworkClassification = "MAIN" | "SUBORDINATE" | "UNASSIGNED";

export type HospitalHierarchyContext = {
  hospital: HospitalHierarchyUnit;
  classification: HospitalNetworkClassification;
  parentHospital: HospitalHierarchyUnit | null;
  directChildCount: number;
  directChildren: readonly HospitalHierarchyUnit[];
};

export type HospitalHierarchyDatabase = PrismaClient | Prisma.TransactionClient;

export type HospitalNetworkRecord = HospitalHierarchyUnit & {
  role: HospitalServiceAreaFacilityKind | null;
  networkParentId: string | null;
};

const hospitalIdSchema = z.string().uuid().transform((value) => value.toLowerCase());

const unitSelect = {
  id: true,
  hospitalCode: true,
  name: true,
  status: true,
} satisfies Prisma.HospitalSelect;

const contextSelect = {
  ...unitSelect,
  serviceAreaEligibility: { select: { kind: true } },
  serviceAreaAssignments: { where: { endedAt: null }, take: 1, select: { parent: { select: unitSelect } } },
  managedServiceAreas: { where: { endedAt: null }, select: { child: { select: unitSelect } } },
} satisfies Prisma.HospitalSelect;

type HospitalContextRecord = Prisma.HospitalGetPayload<{ select: typeof contextSelect }>;

function compareUnits(left: HospitalHierarchyUnit, right: HospitalHierarchyUnit): number {
  return left.name.localeCompare(right.name, "th") ||
    left.hospitalCode.localeCompare(right.hospitalCode, "en") ||
    left.id.localeCompare(right.id, "en");
}

function toUnit(record: HospitalHierarchyUnit): HospitalHierarchyUnit {
  return { id: record.id, hospitalCode: record.hospitalCode, name: record.name, status: record.status };
}

function classify(role: HospitalServiceAreaFacilityKind | null): HospitalNetworkClassification {
  return role === HospitalServiceAreaFacilityKind.PARENT
    ? "MAIN"
    : role === HospitalServiceAreaFacilityKind.CHILD ? "SUBORDINATE" : "UNASSIGNED";
}

export function buildHospitalHierarchyDirectory(records: readonly HospitalNetworkRecord[]): HospitalHierarchyDirectory {
  const parents = records.filter(({ role }) => role === HospitalServiceAreaFacilityKind.PARENT).sort(compareUnits);
  const parentIds = new Set(parents.map(({ id }) => id));
  const groupedIds = new Set(parentIds);
  const groups = parents.map((parent) => {
    const directChildren = records
      .filter(({ networkParentId }) => networkParentId === parent.id)
      .sort(compareUnits);
    for (const child of directChildren) groupedIds.add(child.id);
    return { mainHospital: toUnit(parent), directChildren: directChildren.map(toUnit) };
  });

  return {
    hospitalCount: records.length,
    mainHospitalCount: parents.length,
    subordinateHospitalCount: records.filter(({ role }) => role === HospitalServiceAreaFacilityKind.CHILD).length,
    groups,
    outsideNetwork: records.filter(({ id }) => !groupedIds.has(id)).sort(compareUnits).map(toUnit),
  };
}

function projectContext(record: HospitalContextRecord): HospitalHierarchyContext {
  const classification = classify(record.serviceAreaEligibility?.kind ?? null);
  const parent = record.serviceAreaAssignments[0]?.parent ?? null;
  const directChildren = classification === "MAIN"
    ? record.managedServiceAreas.map(({ child }) => toUnit(child)).sort(compareUnits)
    : [];
  return {
    hospital: toUnit(record),
    classification,
    parentHospital: parent ? toUnit(parent) : null,
    directChildCount: directChildren.length,
    directChildren,
  };
}

async function revalidatePlatformAdmin(actor: ActorContext, database: HospitalHierarchyDatabase): Promise<void> {
  const activeAdmin = await database.user.findFirst({
    where: { id: actor.userId, status: UserStatus.ACTIVE, roles: { some: { role: Role.ADMIN } } },
    select: { id: true },
  });
  if (!activeAdmin) throw new ForbiddenError();
}

async function findOwnerContext(
  actor: ActorContext,
  hospitalId: string,
  database: HospitalHierarchyDatabase,
): Promise<HospitalContextRecord> {
  assertHospitalOwnerPolicy({ actor, capability: HOSPITAL_OWNER_CAPABILITIES.readGovernance, targetHospitalId: hospitalId });
  const membership = await database.hospitalMembership.findFirst({
    where: {
      userId: actor.userId,
      hospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      user: { is: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } },
      hospital: { is: { status: HospitalStatus.ACTIVE } },
    },
    select: { hospital: { select: contextSelect } },
  });
  if (!membership) throw new NotFoundError();
  return membership.hospital;
}

async function findAdminContext(
  actor: ActorContext,
  hospitalId: string,
  database: HospitalHierarchyDatabase,
): Promise<HospitalContextRecord> {
  assertHospitalGovernanceCapability(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance);
  await revalidatePlatformAdmin(actor, database);
  const hospital = await database.hospital.findUnique({ where: { id: hospitalId }, select: contextSelect });
  if (!hospital) throw new NotFoundError();
  return hospital;
}

export async function getHospitalHierarchyDirectory(
  actor: ActorContext | null | undefined,
  database: HospitalHierarchyDatabase = getPrisma(),
): Promise<HospitalHierarchyDirectory> {
  assertHospitalGovernanceCapability(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance);

  try {
    if (!actor) throw new ForbiddenError();
    await revalidatePlatformAdmin(actor, database);
    const hospitals = await database.hospital.findMany({
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }, { id: "asc" }],
      select: {
        ...unitSelect,
        serviceAreaEligibility: { select: { kind: true } },
        serviceAreaAssignments: { where: { endedAt: null }, take: 1, select: { parentHospitalId: true } },
      },
    });
    return buildHospitalHierarchyDirectory(hospitals.map(({ serviceAreaEligibility, serviceAreaAssignments, ...unit }) => ({
      ...unit,
      role: serviceAreaEligibility?.kind ?? null,
      networkParentId: serviceAreaAssignments[0]?.parentHospitalId ?? null,
    })));
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Hospital hierarchy directory could not be loaded");
  }
}

export async function getHospitalHierarchyContext(
  actor: ActorContext | null | undefined,
  hospitalId: unknown,
  database: HospitalHierarchyDatabase = getPrisma(),
): Promise<HospitalHierarchyContext> {
  const parsedId = hospitalIdSchema.safeParse(hospitalId);
  if (!parsedId.success) throw new NotFoundError();
  if (!actor) throw new ForbiddenError();

  try {
    if (actor.roles.includes(Role.ADMIN)) return projectContext(await findAdminContext(actor, parsedId.data, database));
    if (actor.roles.includes(Role.HOSPITAL)) return projectContext(await findOwnerContext(actor, parsedId.data, database));
    throw new ForbiddenError();
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Hospital hierarchy context could not be loaded");
  }
}
