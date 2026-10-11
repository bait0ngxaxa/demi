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

import { hospitalReportPageRequestSchema } from "../schemas/hospital-report-schemas";
import {
  getHospitalReportingPage,
} from "../services/hospital-report-query-service";
import {
  listHospitalReportingHospitals,
  type HospitalReportingHospital,
} from "../services/hospital-report-access-service";
import type { HospitalReportingPageProjection } from "../projections/hospital-report-projection";

export type HospitalReportPageContext = {
  hospitals: readonly HospitalReportingHospital[];
  selectedHospitalId: string;
  page: HospitalReportingPageProjection;
  hierarchy: HospitalHierarchyContext;
};

async function resolveActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

export async function getHospitalReportPageContext(
  requestedHospitalId: string | undefined,
  cursor: string | undefined,
  pageSize: number | undefined,
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
    if (requestedHospitalId !== undefined) notFound();
    redirect("/app");
  }

  const parsedRequest = hospitalReportPageRequestSchema.safeParse({
    hospitalId: requestedHospitalId ?? hospitals[0]?.id,
    cursor,
    pageSize,
  });
  if (!parsedRequest.success) notFound();
  const selectedHospitalId = parsedRequest.data.hospitalId;
  if (!hospitals.some(({ id }) => id === selectedHospitalId)) notFound();

  try {
    const page = await getHospitalReportingPage(actor, parsedRequest.data);
    const hierarchy = await getHospitalHierarchyContext(actor, selectedHospitalId);
    return { hospitals, selectedHospitalId, page, hierarchy };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) notFound();
    throw error;
  }
}
