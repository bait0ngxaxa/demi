import "server-only";

import {
  HospitalStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import {
  GLOBAL_REPORTING_CAPABILITIES,
  decideGlobalReportingPolicy,
  globalReportingPolicyInternals,
  type GlobalReportingCapability,
} from "../policies/global-reporting-policy";
import { hospitalReportHospitalIdSchema } from "../schemas/hospital-report-schemas";

export type GlobalReportingDatabase = PrismaClient | Prisma.TransactionClient;

export type GlobalReportingHospital = {
  id: string;
  hospitalCode: string;
  name: string;
  status: HospitalStatus;
};

export type GlobalReportingAccessContext = {
  actor: ActorContext;
  hospital: GlobalReportingHospital | null;
};

export type GlobalReportingAuditOutcome = "read" | "prepared" | "denied";
export type GlobalReportingAuditReason =
  | "UNAUTHENTICATED"
  | "NOT_AUTHORIZED"
  | "SCOPE_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "UNAVAILABLE";

function getDatabase(database?: GlobalReportingDatabase): GlobalReportingDatabase {
  return database ?? getPrisma();
}

export async function resolveGlobalReportingAccessContext(
  actor: ActorContext | null | undefined,
  capability: GlobalReportingCapability,
  targetHospitalId?: unknown,
  database?: GlobalReportingDatabase,
): Promise<GlobalReportingAccessContext> {
  if (!actor) throw new ForbiddenError();

  const targetCapability = globalReportingPolicyInternals.targetHospitalCapabilities.has(capability);
  const parsedHospitalId = targetCapability
    ? hospitalReportHospitalIdSchema.safeParse(targetHospitalId)
    : null;
  if (targetCapability && !parsedHospitalId?.success) throw new NotFoundError();

  const db = getDatabase(database);

  try {
    const currentUser = await db.user.findUnique({
      where: { id: actor.userId },
      select: {
        status: true,
        roles: { select: { role: true } },
      },
    });

    let hospital: GlobalReportingHospital | null = null;
    if (parsedHospitalId?.success) {
      hospital = await db.hospital.findUnique({
        where: { id: parsedHospitalId.data },
        select: { id: true, hospitalCode: true, name: true, status: true },
      });
      if (!hospital) throw new NotFoundError();
    }

    const decision = decideGlobalReportingPolicy({
      actor,
      capability,
      currentUserStatus: currentUser?.status ?? null,
      currentRoles: currentUser?.roles.map(({ role }) => role) ?? [],
      ...(parsedHospitalId?.success ? {
        targetHospitalId: parsedHospitalId.data,
        targetHospitalStatus: hospital?.status,
      } : {}),
    });

    if (!decision.allowed) throw new ForbiddenError();
    if (hospital && hospital.status !== HospitalStatus.ACTIVE) throw new NotFoundError();

    return { actor, hospital };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) throw error;
    if (error instanceof InfrastructureError) throw error;
    throw new InfrastructureError("Global reporting access could not be verified");
  }
}

export async function recordGlobalReportingAudit(input: {
  actorUserId?: string | null;
  capability: GlobalReportingCapability;
  hospitalId?: string;
  outcome: GlobalReportingAuditOutcome;
  reason?: GlobalReportingAuditReason;
}): Promise<void> {
  const parsedActorId = input.actorUserId ? hospitalReportHospitalIdSchema.safeParse(input.actorUserId) : null;
  const parsedHospitalId = input.hospitalId ? hospitalReportHospitalIdSchema.safeParse(input.hospitalId) : null;
  const isExport = input.capability === GLOBAL_REPORTING_CAPABILITIES.export;

  await recordAuditEvent({
    actorUserId: parsedActorId?.success ? parsedActorId.data : null,
    action: isExport
      ? input.outcome === "denied" ? "global_reporting.export.denied" : "global_reporting.export.prepared"
      : input.outcome === "denied" ? "global_reporting.access.denied" : "global_reporting.access.read",
    resourceType: parsedHospitalId?.success ? "Hospital" : "GlobalReporting",
    ...(parsedHospitalId?.success ? { resourceId: parsedHospitalId.data } : {}),
    metadata: {
      capability: input.capability,
      outcome: input.outcome,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });
}

export function globalReportingAuditReasonForError(error: unknown): GlobalReportingAuditReason {
  if (error instanceof UnauthenticatedError) return "UNAUTHENTICATED";
  if (error instanceof NotFoundError) return "SCOPE_UNAVAILABLE";
  if (error instanceof ForbiddenError) return "NOT_AUTHORIZED";
  if (error instanceof InfrastructureError) return "UNAVAILABLE";
  return "INVALID_REQUEST";
}
