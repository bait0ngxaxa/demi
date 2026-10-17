import "server-only";

import { HospitalStatus, Prisma, Role, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  getHospitalOwnerHierarchyContext,
  resolveHospitalOwnerDirectChildFacility,
  type HospitalHierarchyDatabase,
  type HospitalHierarchyContext,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";
import {
  decideHospitalNetworkChildReportPolicy,
  HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES,
  type HospitalNetworkChildReportCapability,
} from "../policies/hospital-network-child-report-policy";
import { hospitalReportHospitalIdSchema } from "../schemas/hospital-report-schemas";

export type ParentChildHospitalReportAccessDatabase = HospitalHierarchyDatabase;

export type ParentChildHospitalReportAccessContext = {
  actorId: string;
  capability: HospitalNetworkChildReportCapability;
  parentHospitalId: string;
  hospital: {
    id: string;
    status: HospitalStatus;
    parentHospitalId: string;
  };
};

export type ParentChildHospitalReportTargetGroup = {
  parent: { id: string; name: string };
  children: readonly { id: string; name: string }[];
};

const ACCESS_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

function isPrismaClient(database: ParentChildHospitalReportAccessDatabase): database is PrismaClient {
  return "$transaction" in database;
}

async function resolveInDatabase(
  actor: ActorContext,
  parentHospitalId: string,
  childHospitalId: string,
  database: ParentChildHospitalReportAccessDatabase,
  capability: HospitalNetworkChildReportCapability,
): Promise<ParentChildHospitalReportAccessContext> {
  const hierarchy = await resolveHospitalOwnerDirectChildFacility(
    actor,
    parentHospitalId,
    childHospitalId,
    database,
  );
  const decision = decideHospitalNetworkChildReportPolicy({ actor, capability, hierarchy });
  if (!decision.allowed) throw new ForbiddenError();

  return {
    actorId: actor.userId,
    capability,
    parentHospitalId: hierarchy.parent.id,
    hospital: {
      id: hierarchy.child.id,
      status: hierarchy.child.status,
      parentHospitalId: hierarchy.parent.id,
    },
  };
}

/**
 * Resolve within each protected operation/continuation. Pass its transaction client when authorization and query must share a snapshot.
 */
export async function resolveParentChildHospitalReportAccessContext(
  actor: ActorContext | null | undefined,
  parentHospitalId: unknown,
  childHospitalId: unknown,
  database: ParentChildHospitalReportAccessDatabase = getPrisma(),
  capability: HospitalNetworkChildReportCapability = HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES.read,
): Promise<ParentChildHospitalReportAccessContext> {
  if (!actor) throw new ForbiddenError();

  const parsedParentId = hospitalReportHospitalIdSchema.safeParse(parentHospitalId);
  const parsedChildId = hospitalReportHospitalIdSchema.safeParse(childHospitalId);
  if (
    !parsedParentId.success ||
    !parsedChildId.success ||
    parsedParentId.data === parsedChildId.data
  ) {
    throw new NotFoundError();
  }

  const db = database ?? getPrisma();
  try {
    if (!isPrismaClient(db)) {
      return await resolveInDatabase(actor, parsedParentId.data, parsedChildId.data, db, capability);
    }

    return await db.$transaction(
      (transaction) => resolveInDatabase(actor, parsedParentId.data, parsedChildId.data, transaction, capability),
      ACCESS_TRANSACTION_OPTIONS,
    );
  } catch (error: unknown) {
    if (
      error instanceof ForbiddenError ||
      error instanceof NotFoundError ||
      error instanceof InfrastructureError
    ) {
      throw error;
    }
    throw new InfrastructureError("Parent-to-Child Hospital report access could not be verified");
  }
}

/** List only name/ID targets under Parents the current actor directly owns. Each report read still uses the exact-target resolver above. */
export async function listParentChildHospitalReportTargetGroups(
  actor: ActorContext | null | undefined,
  parentHospitalIds: readonly string[],
  database: ParentChildHospitalReportAccessDatabase = getPrisma(),
): Promise<ParentChildHospitalReportTargetGroup[]> {
  if (!actor) throw new ForbiddenError();
  if (!actor.roles.includes(Role.HOSPITAL)) return [];

  const parentIds = [...new Set(parentHospitalIds.flatMap((hospitalId) => {
    const parsed = hospitalReportHospitalIdSchema.safeParse(hospitalId);
    return parsed.success ? [parsed.data] : [];
  }))];

  try {
    const groups = await Promise.all(parentIds.map(async (parentHospitalId) => {
      let context: HospitalHierarchyContext;
      try {
        context = await getHospitalOwnerHierarchyContext(actor, parentHospitalId, database);
      } catch (error: unknown) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) return null;
        throw error;
      }

      if (
        context.classification !== "MAIN" ||
        context.hospital.status !== HospitalStatus.ACTIVE ||
        context.issues.length > 0
      ) {
        return null;
      }

      const group: ParentChildHospitalReportTargetGroup = {
        parent: { id: context.hospital.id, name: context.hospital.name },
        children: context.directChildren
          .filter(({ status, parentHospitalId: currentParentId }) =>
            status === HospitalStatus.ACTIVE && currentParentId === context.hospital.id,
          )
          .map(({ id, name }) => ({ id, name }))
          .sort((left, right) => left.name.localeCompare(right.name, "th") || left.id.localeCompare(right.id)),
      };
      return group;
    }));

    return groups.filter((group): group is ParentChildHospitalReportTargetGroup => group !== null);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Parent-to-Child Hospital report targets could not be loaded");
  }
}
