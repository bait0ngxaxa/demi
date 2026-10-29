import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  getCareTrackingPage,
  listCareTrackingScopes,
  type CareTrackingPage,
  type CareTrackingScopeOption,
} from "@/modules/care-tracking/services/care-tracking-query-service";
import {
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { CareTrackingWorkspaceView } from "./care-tracking-workspace-view";
import {
  findServicesScope,
  firstSearchParam,
  parseServicesFilters,
  scopeKey,
  scopeServicesState,
  servicesHref,
  SERVICES_PATH,
  type ServicesSearchParams,
  type ServicesUrlState,
} from "./services-url";

export const metadata: Metadata = {
  title: "จัดบริการ",
};

type ServicesPageProps = {
  searchParams: Promise<ServicesSearchParams>;
};

async function resolveActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

async function resolveScopes(actor: ActorContext): Promise<CareTrackingScopeOption[]> {
  try {
    return await listCareTrackingScopes(actor);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

/**
 * The "จัดบริการ" workspace over getCareTrackingPage: direct scopes (OWNER/MEMBER, an assigned OSM) and, CT-3,
 * one read-only network Child addressed by its Parent `hospitalId` and `childHospitalId`.
 */
export default async function ServicesPage({ searchParams }: ServicesPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const scopes = await resolveScopes(actor);

  if (scopes.length === 0) {
    redirect("/app");
  }

  const params = await searchParams;
  // The Hospital selector submits one `scope` value; the workspace URL keeps hospitalId and childHospitalId.
  const requestedScopeKey = firstSearchParam(params.scope);
  if (requestedScopeKey !== undefined) {
    const switched = scopes.find((scope) => scopeKey(scope) === requestedScopeKey);
    redirect(switched ? servicesHref(scopeServicesState(switched)) : SERVICES_PATH);
  }

  const requestedHospitalId = firstSearchParam(params.hospitalId);
  const selectedScope = requestedHospitalId === undefined
    ? scopes[0]
    : findServicesScope(scopes, requestedHospitalId, firstSearchParam(params.childHospitalId));

  if (!selectedScope) {
    redirect(SERVICES_PATH);
  }

  const filters = parseServicesFilters(params);
  let state: ServicesUrlState = { ...scopeServicesState(selectedScope), ...filters };
  let result: CareTrackingPage | null = null;
  let errorMessage: string | null = null;

  try {
    result = await getCareTrackingPage(actor, {
      hospitalId: selectedScope.hospitalId,
      ...(selectedScope.access === "NETWORK" ? { childHospitalId: selectedScope.childHospitalId } : {}),
      stages: [...filters.stages],
      signals: [...filters.signals],
      search: filters.search,
      includeEnded: filters.includeEnded,
      page: filters.page,
    });
    state = { ...state, page: result.page };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    if (!(error instanceof ValidationError)) {
      throw error;
    }

    errorMessage = "กรุณาตรวจสอบคำค้นหา แล้วลองใหม่อีกครั้ง";
  }

  return (
    <CareTrackingWorkspaceView
      errorMessage={errorMessage}
      key={scopeKey(selectedScope)}
      result={result}
      scopes={scopes}
      selectedScope={selectedScope}
      state={state}
    />
  );
}
