import "server-only";

import { HospitalStatus, Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  resolveHospitalOwnerDirectChildFacility,
  type HospitalHierarchyDatabase,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  decideHospitalNetworkChildReportPolicy,
  HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES,
} from "../policies/hospital-network-child-report-policy";
import { hospitalReportHospitalIdSchema } from "../schemas/hospital-report-schemas";

export type ParentChildHospitalReportAccessDatabase = HospitalHierarchyDatabase;

export type ParentChildHospitalReportAccessContext = {
  actorId: string;
  capability: typeof HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES.read;
  parentHospitalId: string;
  hospital: {
    id: string;
    status: HospitalStatus;
    parentHospitalId: string;
  };
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
): Promise<ParentChildHospitalReportAccessContext> {
  const hierarchy = await resolveHospitalOwnerDirectChildFacility(
    actor,
    parentHospitalId,
    childHospitalId,
    database,
  );
  const capability = HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES.read;
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
      return await resolveInDatabase(actor, parsedParentId.data, parsedChildId.data, db);
    }

    return await db.$transaction(
      (transaction) => resolveInDatabase(actor, parsedParentId.data, parsedChildId.data, transaction),
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
