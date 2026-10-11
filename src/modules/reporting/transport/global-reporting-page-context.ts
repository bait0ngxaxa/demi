import "server-only";

import { notFound, redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  getHospitalHierarchyContext,
  type HospitalHierarchyContext,
  type HospitalHierarchyUnit,
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
import {
  getGlobalReportingDirectory,
  getGlobalReportingHospitalById,
} from "../services/global-reporting-service";
import { getGlobalAdminHospitalReportingPage } from "../services/hospital-report-query-service";

export type GlobalReportingPageContext = {
  directory: GlobalReportingDirectory;
  selectedHospital: HospitalHierarchyUnit | null;
  hierarchy: HospitalHierarchyContext | null;
  page: HospitalReportingPageProjection | null;
  selectedHospitalId: string | null;
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

export async function getGlobalReportingPageContext(input: {
  hospitalId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<GlobalReportingPageContext> {
  const actor = await resolveActor();
  try {
    await resolveGlobalReportingAccessContext(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead);
  } catch (error: unknown) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead, error);
  }

  const directory = await getGlobalReportingDirectory(actor);
  if (input.hospitalId === undefined) {
    if (input.cursor !== undefined || input.pageSize !== undefined) {
      await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead, new NotFoundError());
    }
    await recordGlobalReportingAudit({
      actorUserId: actor.userId,
      capability: GLOBAL_REPORTING_CAPABILITIES.workspaceRead,
      outcome: "read",
    });
    return {
      directory,
      selectedHospital: null,
      hierarchy: null,
      page: null,
      selectedHospitalId: null,
    };
  }

  const parsedHospitalId = hospitalReportHospitalIdSchema.safeParse(input.hospitalId);
  if (!parsedHospitalId.success) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead, new NotFoundError());
    throw new NotFoundError();
  }
  const selectedHospitalId = parsedHospitalId.data;
  const selectedHospital = getGlobalReportingHospitalById(directory, selectedHospitalId);
  if (!selectedHospital) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead, new NotFoundError(), selectedHospitalId);
    throw new NotFoundError();
  }

  let hierarchy: HospitalHierarchyContext;
  try {
    hierarchy = await getHospitalHierarchyContext(actor, selectedHospitalId);
  } catch (error: unknown) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.workspaceRead, error, selectedHospitalId);
    throw error;
  }

  if (selectedHospital.status !== "ACTIVE") {
    if (input.cursor !== undefined || input.pageSize !== undefined) {
      await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.hospitalRead, new NotFoundError(), selectedHospitalId);
    }
    try {
      await resolveGlobalReportingAccessContext(
        actor,
        GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      );
    } catch (error: unknown) {
      await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.directoryRead, error, selectedHospitalId);
    }
    return {
      directory,
      selectedHospital,
      hierarchy,
      page: null,
      selectedHospitalId,
    };
  }

  const parsedRequest = hospitalReportPageRequestSchema.safeParse({
    hospitalId: selectedHospitalId,
    cursor: input.cursor,
    pageSize: input.pageSize,
  });
  if (!parsedRequest.success) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.hospitalRead, new NotFoundError(), selectedHospitalId);
    throw new NotFoundError();
  }

  let page: HospitalReportingPageProjection;
  try {
    page = await getGlobalAdminHospitalReportingPage(actor, parsedRequest.data);
    await resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      selectedHospitalId,
    );
  } catch (error: unknown) {
    await denyAndHide(actor, GLOBAL_REPORTING_CAPABILITIES.hospitalRead, error, selectedHospitalId);
    throw error;
  }

  await recordGlobalReportingAudit({
    actorUserId: actor.userId,
    capability: GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
    hospitalId: selectedHospitalId,
    outcome: "read",
  });

  return {
    directory,
    selectedHospital,
    hierarchy,
    page,
    selectedHospitalId,
  };
}
