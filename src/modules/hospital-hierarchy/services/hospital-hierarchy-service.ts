import "server-only";

import {
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
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

export type HospitalHierarchyUnit = {
  id: string;
  hospitalCode: string;
  name: string;
  status: HospitalStatus;
  parentHospitalId: string | null;
};

export type HospitalHierarchyIssueCode =
  | "MISSING_PARENT"
  | "SELF_PARENT"
  | "CYCLE"
  | "PARENT_IS_SUBORDINATE"
  | "PARENT_INVALID"
  | "DUPLICATE_IDENTITY";

export type HospitalHierarchyIssue = {
  code: HospitalHierarchyIssueCode;
  hospitalId: string;
  hospitalCode: string;
  parentHospitalCode: string | null;
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
  diagnostics: readonly {
    hospital: HospitalHierarchyUnit;
    parentHospital: HospitalHierarchyUnit | null;
    issues: readonly HospitalHierarchyIssue[];
  }[];
};

export type HospitalHierarchyContext = {
  hospital: HospitalHierarchyUnit;
  classification: "MAIN" | "SUBORDINATE";
  parentHospital: HospitalHierarchyUnit | null;
  directChildCount: number;
  directChildren: readonly HospitalHierarchyUnit[];
  issues: readonly HospitalHierarchyIssue[];
};

export type HospitalNetworkScope = {
  P: { hospitalIds: readonly [string] };
  C: { hospitalIds: readonly string[] };
  N: { hospitalIds: readonly string[] };
};

export type HospitalHierarchyDatabase = PrismaClient | Prisma.TransactionClient;

const hospitalIdSchema = z.string().uuid().transform((value) => value.toLowerCase());

const unitSelect = {
  id: true,
  hospitalCode: true,
  name: true,
  status: true,
  parentHospitalId: true,
} satisfies Prisma.HospitalSelect;

const directorySelect = {
  ...unitSelect,
} satisfies Prisma.HospitalSelect;

const hierarchyContextSelect = {
  ...unitSelect,
  parentHospital: { select: unitSelect },
  childHospitals: {
    orderBy: [{ name: "asc" }, { hospitalCode: "asc" }, { id: "asc" }],
    select: unitSelect,
  },
} satisfies Prisma.HospitalSelect;

type HospitalHierarchyContextRecord = Prisma.HospitalGetPayload<{
  select: typeof hierarchyContextSelect;
}>;

function compareUnits(left: HospitalHierarchyUnit, right: HospitalHierarchyUnit): number {
  return left.name.localeCompare(right.name, "th") ||
    left.hospitalCode.localeCompare(right.hospitalCode, "en") ||
    left.id.localeCompare(right.id, "en");
}

function uniqueIssues(issues: readonly HospitalHierarchyIssue[]): HospitalHierarchyIssue[] {
  const byKey = new Map<string, HospitalHierarchyIssue>();
  for (const issue of issues) {
    byKey.set(`${issue.code}:${issue.hospitalId}:${issue.parentHospitalCode ?? ""}`, issue);
  }
  return [...byKey.values()];
}

function createIssue(
  code: HospitalHierarchyIssueCode,
  hospital: HospitalHierarchyUnit,
  parentHospitalCode: string | null,
): HospitalHierarchyIssue {
  return { code, hospitalId: hospital.id, hospitalCode: hospital.hospitalCode, parentHospitalCode };
}

export function buildHospitalHierarchyDirectory(
  records: readonly HospitalHierarchyUnit[],
): HospitalHierarchyDirectory {
  const byId = new Map<string, HospitalHierarchyUnit>();
  const idsByCode = new Map<string, string>();
  const issuesById = new Map<string, HospitalHierarchyIssue[]>();

  const addIssue = (issue: HospitalHierarchyIssue): void => {
    const current = issuesById.get(issue.hospitalId) ?? [];
    current.push(issue);
    issuesById.set(issue.hospitalId, current);
  };

  for (const record of records) {
    const existingById = byId.get(record.id);
    const existingIdByCode = idsByCode.get(record.hospitalCode);
    if (existingById || existingIdByCode) {
      addIssue(createIssue("DUPLICATE_IDENTITY", record, null));
      if (existingById) addIssue(createIssue("DUPLICATE_IDENTITY", existingById, null));
      const existingByCode = existingIdByCode ? byId.get(existingIdByCode) : undefined;
      if (existingByCode) addIssue(createIssue("DUPLICATE_IDENTITY", existingByCode, null));
    }
    byId.set(record.id, record);
    idsByCode.set(record.hospitalCode, record.id);
  }

  for (const hospital of records) {
    if (hospital.parentHospitalId === null) continue;
    if (hospital.parentHospitalId === hospital.id) {
      addIssue(createIssue("SELF_PARENT", hospital, hospital.hospitalCode));
      continue;
    }

    const parent = byId.get(hospital.parentHospitalId);
    if (!parent) {
      addIssue(createIssue("MISSING_PARENT", hospital, null));
    } else if (parent.parentHospitalId !== null) {
      addIssue(createIssue("PARENT_IS_SUBORDINATE", hospital, parent.hospitalCode));
    } else if (issuesById.get(parent.id)?.length) {
      addIssue(createIssue("PARENT_INVALID", hospital, parent.hospitalCode));
    }
  }

  for (const start of records) {
    const path: string[] = [];
    const pathIndexes = new Map<string, number>();
    let current: HospitalHierarchyUnit | undefined = start;

    while (current !== undefined && current.parentHospitalId !== null) {
      if (current.parentHospitalId === current.id) break;
      const cycleStart = pathIndexes.get(current.id);
      if (cycleStart !== undefined) {
        for (const cycleId of path.slice(cycleStart)) {
          const cycleHospital = byId.get(cycleId);
          if (cycleHospital) addIssue(createIssue("CYCLE", cycleHospital, null));
        }
        break;
      }
      pathIndexes.set(current.id, path.length);
      path.push(current.id);
      current = byId.get(current.parentHospitalId);
    }
  }

  const groups: HospitalHierarchyGroup[] = [];
  const groupedIds = new Set<string>();
  const roots = records
    .filter((record) => record.parentHospitalId === null && !(issuesById.get(record.id)?.length))
    .slice()
    .sort(compareUnits);

  for (const mainHospital of roots) {
    const directChildren = records
      .filter((record) => record.parentHospitalId === mainHospital.id)
      .slice()
      .sort(compareUnits);
    groupedIds.add(mainHospital.id);
    for (const child of directChildren) groupedIds.add(child.id);
    groups.push({ mainHospital, directChildren });
  }

  const diagnostics = records
    .filter((hospital) => !groupedIds.has(hospital.id))
    .map((hospital) => {
      const parentHospital = hospital.parentHospitalId
        ? byId.get(hospital.parentHospitalId) ?? null
        : null;
      const issues = uniqueIssues(issuesById.get(hospital.id) ?? []);
      if (issues.length === 0) {
        issues.push(createIssue("PARENT_INVALID", hospital, parentHospital?.hospitalCode ?? null));
      }
      return { hospital, parentHospital, issues };
    })
    .sort((left, right) => compareUnits(left.hospital, right.hospital));

  return {
    hospitalCount: records.length,
    mainHospitalCount: records.filter(({ parentHospitalId }) => parentHospitalId === null).length,
    subordinateHospitalCount: records.filter(({ parentHospitalId }) => parentHospitalId !== null).length,
    groups,
    diagnostics,
  };
}

function toUnit(record: HospitalHierarchyContextRecord | HospitalHierarchyUnit): HospitalHierarchyUnit {
  return {
    id: record.id,
    hospitalCode: record.hospitalCode,
    name: record.name,
    status: record.status,
    parentHospitalId: record.parentHospitalId,
  };
}

function contextIssue(
  code: HospitalHierarchyIssueCode,
  hospital: HospitalHierarchyUnit,
  parentHospitalCode: string | null,
): HospitalHierarchyIssue {
  return createIssue(code, hospital, parentHospitalCode);
}

function projectHospitalHierarchyContext(
  record: HospitalHierarchyContextRecord,
  ancestorIssues: readonly HospitalHierarchyIssue[],
): HospitalHierarchyContext {
  const hospital = toUnit(record);
  const parentHospital = record.parentHospital ? toUnit(record.parentHospital) : null;
  const issues = [...ancestorIssues];

  if (hospital.parentHospitalId !== null && parentHospital === null) {
    issues.push(contextIssue("MISSING_PARENT", hospital, null));
  }
  if (hospital.parentHospitalId === hospital.id) {
    issues.push(contextIssue("SELF_PARENT", hospital, hospital.hospitalCode));
  }
  if (parentHospital && parentHospital.parentHospitalId !== null) {
    issues.push(contextIssue("PARENT_IS_SUBORDINATE", hospital, parentHospital.hospitalCode));
  }

  const classification = hospital.parentHospitalId === null ? "MAIN" : "SUBORDINATE";
  const directChildren = classification === "MAIN"
    ? record.childHospitals.map(toUnit).filter((child) => {
        if (child.parentHospitalId === hospital.id) return true;
        issues.push(contextIssue("MISSING_PARENT", child, hospital.hospitalCode));
        return false;
      })
    : [];

  return {
    hospital,
    classification,
    parentHospital,
    directChildCount: directChildren.length,
    directChildren,
    issues: uniqueIssues(issues),
  };
}

async function revalidatePlatformAdmin(
  actor: ActorContext,
  database: HospitalHierarchyDatabase,
): Promise<void> {
  const activeAdmin = await database.user.findFirst({
    where: {
      id: actor.userId,
      status: UserStatus.ACTIVE,
      roles: { some: { role: Role.ADMIN } },
    },
    select: { id: true },
  });
  if (!activeAdmin) throw new ForbiddenError();
}

async function findOwnerHierarchyContext(
  actor: ActorContext,
  hospitalId: string,
  database: HospitalHierarchyDatabase,
): Promise<HospitalHierarchyContextRecord> {
  assertHospitalOwnerPolicy({
    actor,
    capability: HOSPITAL_OWNER_CAPABILITIES.readGovernance,
    targetHospitalId: hospitalId,
  });

  const membership = await database.hospitalMembership.findFirst({
    where: {
      userId: actor.userId,
      hospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      user: {
        is: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.HOSPITAL } },
        },
      },
      hospital: { is: { status: HospitalStatus.ACTIVE } },
    },
    select: { hospital: { select: hierarchyContextSelect } },
  });

  if (!membership) throw new NotFoundError();
  return membership.hospital;
}

async function findHierarchyContextForAdmin(
  actor: ActorContext,
  hospitalId: string,
  database: HospitalHierarchyDatabase,
): Promise<HospitalHierarchyContextRecord> {
  assertHospitalGovernanceCapability(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance);
  await revalidatePlatformAdmin(actor, database);

  const hospital = await database.hospital.findUnique({
    where: { id: hospitalId },
    select: hierarchyContextSelect,
  });
  if (!hospital) throw new NotFoundError();
  return hospital;
}

async function loadHospitalOwnerHierarchyContext(
  actor: ActorContext,
  hospitalId: string,
  database: HospitalHierarchyDatabase,
): Promise<HospitalHierarchyContext> {
  const record = await findOwnerHierarchyContext(actor, hospitalId, database);
  const ancestorIssues = await resolveAncestorIssues(toUnit(record), database);
  return projectHospitalHierarchyContext(record, ancestorIssues);
}

async function resolveAncestorIssues(
  hospital: HospitalHierarchyUnit,
  database: HospitalHierarchyDatabase,
): Promise<HospitalHierarchyIssue[]> {
  const issues: HospitalHierarchyIssue[] = [];
  const visitedIds = new Set<string>([hospital.id]);
  let parentId = hospital.parentHospitalId;

  while (parentId !== null) {
    if (visitedIds.has(parentId)) {
      issues.push(contextIssue("CYCLE", hospital, null));
      break;
    }
    visitedIds.add(parentId);
    const parent = await database.hospital.findUnique({
      where: { id: parentId },
      select: { id: true, hospitalCode: true, name: true, status: true, parentHospitalId: true },
    });
    if (!parent) {
      issues.push(contextIssue("MISSING_PARENT", hospital, null));
      break;
    }
    if (parent.parentHospitalId !== null) {
      issues.push(contextIssue("PARENT_IS_SUBORDINATE", hospital, parent.hospitalCode));
    }
    parentId = parent.parentHospitalId;
  }

  return uniqueIssues(issues);
}

export async function getHospitalHierarchyDirectory(
  actor: ActorContext | null | undefined,
  database: HospitalHierarchyDatabase = getPrisma(),
): Promise<HospitalHierarchyDirectory> {
  assertHospitalGovernanceCapability(actor, HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance);

  try {
    if (!actor) throw new ForbiddenError();
    await revalidatePlatformAdmin(actor, database);
    const records = await database.hospital.findMany({
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }, { id: "asc" }],
      select: directorySelect,
    });
    return buildHospitalHierarchyDirectory(records);
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
    if (actor.roles.includes(Role.ADMIN)) {
      const record = await findHierarchyContextForAdmin(actor, parsedId.data, database);
      const ancestorIssues = await resolveAncestorIssues(toUnit(record), database);
      return projectHospitalHierarchyContext(record, ancestorIssues);
    }
    if (actor.roles.includes(Role.HOSPITAL)) {
      return await loadHospitalOwnerHierarchyContext(actor, parsedId.data, database);
    }
    throw new ForbiddenError();
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Hospital hierarchy context could not be loaded");
  }
}

/** Resolve hierarchy through the current direct Hospital OWNER path, even for multi-role actors. */
export async function getHospitalOwnerHierarchyContext(
  actor: ActorContext | null | undefined,
  hospitalId: unknown,
  database: HospitalHierarchyDatabase = getPrisma(),
): Promise<HospitalHierarchyContext> {
  const parsedId = hospitalIdSchema.safeParse(hospitalId);
  if (!parsedId.success) throw new NotFoundError();
  if (!actor?.roles.includes(Role.HOSPITAL)) throw new ForbiddenError();

  try {
    return await loadHospitalOwnerHierarchyContext(actor, parsedId.data, database);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Hospital owner hierarchy context could not be loaded");
  }
}

export async function resolveDirectChildFacilities(
  actor: ActorContext | null | undefined,
  parentHospitalId: unknown,
  database: HospitalHierarchyDatabase = getPrisma(),
): Promise<readonly HospitalHierarchyUnit[]> {
  const context = await getHospitalHierarchyContext(actor, parentHospitalId, database);
  if (context.issues.length > 0) {
    throw new ConflictError("Hospital hierarchy is invalid");
  }
  if (context.classification !== "MAIN") {
    throw new ValidationError("Direct child facilities require a main Hospital context");
  }
  return context.directChildren;
}

export async function resolveHospitalOwnerDirectChildFacility(
  actor: ActorContext | null | undefined,
  parentHospitalId: unknown,
  childHospitalId: unknown,
  database: HospitalHierarchyDatabase = getPrisma(),
): Promise<{
  parent: HospitalHierarchyUnit;
  child: HospitalHierarchyUnit;
  issues: readonly HospitalHierarchyIssue[];
}> {
  const parsedParentId = hospitalIdSchema.safeParse(parentHospitalId);
  const parsedChildId = hospitalIdSchema.safeParse(childHospitalId);
  if (!parsedParentId.success || !parsedChildId.success || parsedParentId.data === parsedChildId.data) {
    throw new NotFoundError();
  }
  if (!actor?.roles.includes(Role.HOSPITAL)) throw new ForbiddenError();

  try {
    const context = await loadHospitalOwnerHierarchyContext(actor, parsedParentId.data, database);
    if (
      context.issues.length > 0 ||
      context.classification !== "MAIN" ||
      context.hospital.status !== HospitalStatus.ACTIVE
    ) {
      throw new NotFoundError();
    }

    const child = context.directChildren.find(({ id }) => id === parsedChildId.data);
    if (!child || child.status !== HospitalStatus.ACTIVE) throw new NotFoundError();

    return { parent: context.hospital, child, issues: context.issues };
  } catch (error: unknown) {
    if (error instanceof ConflictError || error instanceof ValidationError) throw new NotFoundError();
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Hospital direct-child scope could not be verified");
  }
}

export async function resolveHospitalNetworkScope(
  actor: ActorContext | null | undefined,
  parentHospitalId: unknown,
  database: HospitalHierarchyDatabase = getPrisma(),
): Promise<HospitalNetworkScope> {
  const parsedId = hospitalIdSchema.safeParse(parentHospitalId);
  if (!parsedId.success) throw new NotFoundError();
  if (!actor?.roles.includes(Role.HOSPITAL)) throw new ForbiddenError();

  try {
    const context = await loadHospitalOwnerHierarchyContext(actor, parsedId.data, database);
    if (context.classification !== "MAIN") {
      throw new ValidationError("Network scope requires a main Hospital");
    }
    if (context.hospital.status !== HospitalStatus.ACTIVE) {
      throw new ForbiddenError();
    }
    if (context.issues.length > 0) {
      throw new ConflictError("Hospital hierarchy is invalid");
    }

    const activeChildIds = context.directChildren
      .filter(({ status }) => status === HospitalStatus.ACTIVE)
      .map(({ id }) => id);
    const parentIds: readonly [string] = [context.hospital.id];
    const networkIds = [context.hospital.id, ...activeChildIds];
    return {
      P: { hospitalIds: parentIds },
      C: { hospitalIds: activeChildIds },
      N: { hospitalIds: networkIds },
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Hospital network scope could not be resolved");
  }
}
