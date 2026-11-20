import "server-only";

import { HospitalStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  getHospitalHierarchyContext,
  type HospitalHierarchyContext,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import type { HospitalReportingPageProjection } from "../projections/hospital-report-projection";
import type { GlobalReportingDirectory } from "../projections/global-reporting-projection";
import {
  hospitalReportHospitalIdSchema,
  hospitalReportPageRequestSchema,
} from "../schemas/hospital-report-schemas";
import {
  globalReportingAuditReasonForError,
  recordGlobalReportingAudit,
  resolveGlobalReportingAccessContext,
} from "../services/global-reporting-access-service";
import { getGlobalReportingDirectory } from "../services/global-reporting-service";
import { getGlobalAdminHospitalReportingPage } from "../services/hospital-report-query-service";

/** The system report directory: the organisation summary and every Hospital to choose from. */
export type GlobalReportingDirectoryPageContext = {
  directory: GlobalReportingDirectory;
};

/** One Hospital's system report page; `page` is null unless the Hospital is ACTIVE. */
export type GlobalHospitalReportPageContext = {
  hierarchy: HospitalHierarchyContext;
  page: HospitalReportingPageProjection | null;
};

async function resolveActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    await recordGlobalReportingAudit({
      capability: GLOBAL_REPORTING_CAPABILITIES.workspaceRead,
      outcome: "denied",
      reason: globalReportingAuditReasonForError(error),
    });
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

async function denyAndHide(
  actor: ActorContext,
  capability:
    | typeof GLOBAL_REPORTING_CAPABILITIES.workspaceRead
    | typeof GLOBAL_REPORTING_CAPABILITIES.directoryRead
    | typeof GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
  error: unknown,
  hospitalId?: string,
): Promise<never> {
  await recordGlobalReportingAudit({
    actorUserId: actor.userId,
    capability,
    ...(hospitalId ? { hospitalId } : {}),
    outcome: "denied",
    reason: globalReportingAuditReasonForError(error),
  });
  if (error instanceof ForbiddenError) redirect("/app");
  if (error instanceof NotFoundError) notFound();
  throw error;
}

async function assertWorkspaceAccess(actor: ActorContext): Promise<void> {
  try {
    await resolveGlobalReportingAccessContext(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead);
  } catch (error: unknown) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead, error);
  }
}

/** The directory page reads the directory only; a Hospital's report has its own page. */
export async function getGlobalReportingDirectoryPageContext(): Promise<GlobalReportingDirectoryPageContext> {
  const actor = await resolveActor();
  await assertWorkspaceAccess(actor);

  const directory = await getGlobalReportingDirectory(actor);
  await recordGlobalReportingAudit({
    actorUserId: actor.userId,
    capability: GLOBAL_REPORTING_CAPABILITIES.workspaceRead,
    outcome: "read",
  });
  return { directory };
}

/**
 * One Hospital's report without the directory: no directory read and no directoryRead audit. A RETIRED Hospital is
 * hidden as before (the directory never listed it); a Hospital that is not ACTIVE shows its status only, and that view
 * is audited as a workspace read of the Hospital.
 */
export async function getGlobalHospitalReportPageContext(input: {
  hospitalId: string;
  search?: string;
  progress?: string;
  status?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<GlobalHospitalReportPageContext> {
  const actor = await resolveActor();
  await assertWorkspaceAccess(actor);

  const parsedHospitalId = hospitalReportHospitalIdSchema.safeParse(input.hospitalId);
  if (!parsedHospitalId.success) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead, new NotFoundError());
    throw new NotFoundError();
  }
  const hospitalId = parsedHospitalId.data;

  let hierarchy: HospitalHierarchyContext;
  try {
    hierarchy = await getHospitalHierarchyContext(actor, hospitalId);
  } catch (error: unknown) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead, error, hospitalId);
    throw error;
  }
  // Phase N1: a RETIRED Hospital was withdrawn before it was ever used; reports leave it out.
  if (hierarchy.hospital.status === HospitalStatus.RETIRED) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead, new NotFoundError(), hospitalId);
    throw new NotFoundError();
  }

  if (hierarchy.hospital.status !== HospitalStatus.ACTIVE) {
    if (input.cursor !== undefined || input.pageSize !== undefined) {
      await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.hospitalRead, new NotFoundError(), hospitalId);
    }
    try {
      await resolveGlobalReportingAccessContext(actor, GLOBAL_REPORTING_CAPABILITIES.directoryRead);
    } catch (error: unknown) {
      await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.directoryRead, error, hospitalId);
    }
    await recordGlobalReportingAudit({
      actorUserId: actor.userId,
      capability: GLOBAL_REPORTING_CAPABILITIES.workspaceRead,
      hospitalId,
      outcome: "read",
    });
    return { hierarchy, page: null };
  }

  const parsedRequest = hospitalReportPageRequestSchema.safeParse({
    hospitalId,
    search: input.search,
    progress: input.progress,
    status: input.status,
    cursor: input.cursor,
    pageSize: input.pageSize,
  });
  if (!parsedRequest.success) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.hospitalRead, new NotFoundError(), hospitalId);
    throw new NotFoundError();
  }

  let page: HospitalReportingPageProjection;
  try {
    page = await getGlobalAdminHospitalReportingPage(actor, parsedRequest.data);
    await resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospitalId,
    );
  } catch (error: unknown) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.hospitalRead, error, hospitalId);
    throw error;
  }

  await recordGlobalReportingAudit({
    actorUserId: actor.userId,
    capability: GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
    hospitalId,
    outcome: "read",
  });

  return { hierarchy, page };
}
