import "server-only";

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

import type {
  HospitalReportingPageProjection,
  ParentChildHospitalReportPageProjection,
} from "../projections/hospital-report-projection";
import {
  hospitalReportPageRequestSchema,
  parseHospitalReportTargetSelection,
  type HospitalReportTargetSelection,
} from "../schemas/hospital-report-schemas";
import {
  listHospitalReportingHospitals,
  type HospitalReportingHospital,
} from "../services/hospital-report-access-service";
import {
  listParentChildHospitalReportTargetGroups,
  type ParentChildHospitalReportTargetGroup,
} from "../services/parent-child-hospital-report-access-service";
import {
  getHospitalReportingPage,
  getParentChildHospitalReportingPage,
} from "../services/hospital-report-query-service";

type HospitalReportPageContextBase = {
  hospitals: readonly HospitalReportingHospital[];
  parentGroups: readonly ParentChildHospitalReportTargetGroup[];
  selection: HospitalReportTargetSelection;
  selectedHospitalId: string;
};

export type HospitalReportPageContext =
  | (HospitalReportPageContextBase & {
      mode: "DIRECT_OWNER";
      page: HospitalReportingPageProjection;
      hierarchy: HospitalHierarchyContext;
    })
  | (HospitalReportPageContextBase & {
      mode: "PARENT_CHILD";
      report: ParentChildHospitalReportPageProjection;
    });

async function resolveActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

function parentGroupContainsTarget(
  groups: readonly ParentChildHospitalReportTargetGroup[],
  parentHospitalId: string,
  hospitalId: string,
): boolean {
  return groups.some((group) =>
    group.parent.id === parentHospitalId && group.children.some((child) => child.id === hospitalId),
  );
}

export async function getHospitalReportPageContext(
  requestedHospitalId: string | undefined,
  cursor: string | undefined,
  pageSize: number | undefined,
  requestedTarget?: string,
): Promise<HospitalReportPageContext> {
  const actor = await resolveActor();
  let hospitals: HospitalReportingHospital[];
  try {
    hospitals = await listHospitalReportingHospitals(actor);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) notFound();
    throw error;
  }

  if (hospitals.length === 0) {
    if (requestedHospitalId !== undefined || requestedTarget !== undefined) notFound();
    redirect("/app");
  }

  if (requestedHospitalId !== undefined && requestedTarget !== undefined) notFound();

  const parentGroups = await listParentChildHospitalReportTargetGroups(
    actor,
    hospitals.map(({ id }) => id),
  );
  const selection = requestedTarget === undefined
    ? requestedHospitalId === undefined
      ? { kind: "DIRECT_OWNER" as const, hospitalId: hospitals[0]?.id ?? "" }
      : { kind: "DIRECT_OWNER" as const, hospitalId: requestedHospitalId }
    : parseHospitalReportTargetSelection(requestedTarget);

  if (!selection || selection.hospitalId === "") notFound();

  if (selection.kind === "DIRECT_OWNER") {
    const parsedRequest = hospitalReportPageRequestSchema.safeParse({
      hospitalId: selection.hospitalId,
      cursor,
      pageSize,
    });
    if (!parsedRequest.success) notFound();
    const directHospital = hospitals.find(({ id }) => id === parsedRequest.data.hospitalId);
    if (!directHospital) notFound();

    try {
      const page = await getHospitalReportingPage(actor, parsedRequest.data);
      const hierarchy = await getHospitalHierarchyContext(actor, directHospital.id);
      return {
        mode: "DIRECT_OWNER",
        hospitals,
        parentGroups,
        selection: { kind: "DIRECT_OWNER", hospitalId: directHospital.id },
        selectedHospitalId: directHospital.id,
        page,
        hierarchy,
      };
    } catch (error: unknown) {
      if (error instanceof ForbiddenError || error instanceof NotFoundError) notFound();
      throw error;
    }
  }

  if (cursor !== undefined || pageSize !== undefined) notFound();

  const directlyOwnedHospital = hospitals.find(({ id }) => id === selection.hospitalId);
  if (directlyOwnedHospital) {
    const currentParentRelationship = parentGroupContainsTarget(
      parentGroups,
      selection.parentHospitalId,
      selection.hospitalId,
    );
    try {
      const parsedRequest = hospitalReportPageRequestSchema.safeParse({ hospitalId: directlyOwnedHospital.id });
      if (!parsedRequest.success) notFound();
      const [page, hierarchy] = await Promise.all([
        getHospitalReportingPage(actor, parsedRequest.data),
        getHospitalHierarchyContext(actor, directlyOwnedHospital.id),
      ]);
      return {
        mode: "DIRECT_OWNER",
        hospitals,
        parentGroups,
        selection: currentParentRelationship
          ? selection
          : { kind: "DIRECT_OWNER", hospitalId: directlyOwnedHospital.id },
        selectedHospitalId: directlyOwnedHospital.id,
        page,
        hierarchy,
      };
    } catch (error: unknown) {
      if (error instanceof ForbiddenError || error instanceof NotFoundError) notFound();
      throw error;
    }
  }

  if (!parentGroupContainsTarget(parentGroups, selection.parentHospitalId, selection.hospitalId)) notFound();

  try {
    const report = await getParentChildHospitalReportingPage(actor, {
      parentHospitalId: selection.parentHospitalId,
      hospitalId: selection.hospitalId,
    });
    return {
      mode: "PARENT_CHILD",
      hospitals,
      parentGroups,
      selection,
      selectedHospitalId: report.hospital.id,
      report,
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) notFound();
    throw error;
  }
}
