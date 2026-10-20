import "server-only";

import { HospitalStatus, Prisma, Role, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  findNetworkChild,
  listNetworkScopes,
  type HospitalNetworkDatabase,
} from "@/modules/hospital-service-areas/services/hospital-network-access";
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
import {
  decideHospitalNetworkChildReportPolicy,
  HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES,
  type HospitalNetworkChildReportCapability,
} from "../policies/hospital-network-child-report-policy";
import { hospitalReportHospitalIdSchema } from "../schemas/hospital-report-schemas";

export type ParentChildHospitalReportAccessDatabase = HospitalNetworkDatabase;

export type ParentChildHospitalReportAccessContext = {
  actorId: string;
  capability: HospitalNetworkChildReportCapability;
  parentHospitalId: string;
  parent: { id: string; name: string };
  hospital: {
    id: string;
    name: string;
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
  // Context check first (no read for a non-OWNER), then persisted proof through the network association.
  assertHospitalOwnerPolicy({
    actor,
    capability: HOSPITAL_OWNER_CAPABILITIES.readGovernance,
    targetHospitalId: parentHospitalId,
  });
  // ADR-0016: the active operational network (not canonical Master placement) scopes Parent reports.
  const network = await findNetworkChild(database, actor.userId, parentHospitalId, childHospitalId, "OWNER");
  if (!network) throw new NotFoundError();

  const decision = decideHospitalNetworkChildReportPolicy({
    actor,
    capability,
    hierarchy: {
      parent: { id: network.parent.id, status: HospitalStatus.ACTIVE, parentHospitalId: null },
      child: { id: network.child.id, status: HospitalStatus.ACTIVE, parentHospitalId: network.parent.id },
      issues: [],
    },
  });
  if (!decision.allowed) throw new ForbiddenError();

  return {
    actorId: actor.userId,
    capability,
    parentHospitalId: network.parent.id,
    parent: { id: network.parent.id, name: network.parent.name },
    hospital: {
      id: network.child.id,
      name: network.child.name,
      status: HospitalStatus.ACTIVE,
      parentHospitalId: network.parent.id,
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

/** List only name/ID targets of the active networks of Parents the actor directly owns. Each report read still uses the exact-target resolver above. */
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
    const requested = new Set(parentIds);
    const scopes = await listNetworkScopes(database, actor.userId, "OWNER");
    return scopes
      .filter(({ parent }) => requested.has(parent.id))
      .map(({ parent, children }) => ({
        parent: { id: parent.id, name: parent.name },
        children: children.map(({ id, name }) => ({ id, name })),
      }));
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Parent-to-Child Hospital report targets could not be loaded");
  }
}
