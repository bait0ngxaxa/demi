import "server-only";

import { createHmac } from "node:crypto";
import { notFound, redirect } from "next/navigation";

import { getServerEnv } from "@/lib/env/server";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";

import {
  listEligibleHospitalContentOwnerHospitals,
  listHospitalContentForOwner,
  readHospitalContentForOwner,
} from "../services/hospital-content-service";
import type {
  HospitalContentDetailProjection,
  HospitalContentListProjection,
  HospitalContentOwnerHospital,
} from "../types/hospital-content-projections";
import { hospitalContentLocatorSchema } from "../schemas/hospital-content-schemas";

export type HospitalContentSelectionContext = {
  hospitals: HospitalContentOwnerHospital[];
  selectedHospitalId: string;
};

export type HospitalContentListPageContext = HospitalContentSelectionContext & {
  page: HospitalContentListProjection;
};

export type HospitalContentCreatePageContext = HospitalContentSelectionContext & {
  recoveryScope: string;
};

export type HospitalContentDetailPageContext = {
  content: HospitalContentDetailProjection;
  requestScope: string;
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

async function resolveSelection(
  actor: ActorContext,
  requestedHospitalId: string | undefined,
): Promise<HospitalContentSelectionContext> {
  let normalizedRequested: string | undefined;
  if (requestedHospitalId !== undefined) {
    const parsed = hospitalContentLocatorSchema.safeParse(requestedHospitalId);
    if (!parsed.success) notFound();
    normalizedRequested = parsed.data;
  }

  let hospitals: HospitalContentOwnerHospital[];
  try {
    hospitals = await listEligibleHospitalContentOwnerHospitals(actor);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      if (normalizedRequested !== undefined) notFound();
      redirect("/app");
    }
    throw error;
  }
  if (hospitals.length === 0) {
    if (normalizedRequested !== undefined) notFound();
    redirect("/app");
  }

  const selectedHospitalId = normalizedRequested ?? hospitals[0]?.id;
  if (!selectedHospitalId || !hospitals.some(({ id }) => id === selectedHospitalId)) notFound();
  return { hospitals, selectedHospitalId };
}

function createRecoveryScope(actor: ActorContext): string {
  try {
    return createHmac("sha256", getServerEnv().IDENTITY_HASH_SECRET)
      .update(`demi.hospital-content.create-recovery.v1\u0000${actor.userId.toLowerCase()}\u0000${actor.personId.toLowerCase()}`, "utf8")
      .digest("base64url");
  } catch {
    throw new Error("Hospital Content recovery scope is unavailable");
  }
}

export async function getHospitalContentListPageContext(
  requestedHospitalId: string | undefined,
  cursor: string | undefined,
): Promise<HospitalContentListPageContext> {
  const actor = await resolveActor();
  const selection = await resolveSelection(actor, requestedHospitalId);
  try {
    const page = await listHospitalContentForOwner(actor, selection.selectedHospitalId, cursor);
    return { ...selection, page };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof ValidationError) notFound();
    throw error;
  }
}

export async function getHospitalContentCreatePageContext(
  requestedHospitalId: string | undefined,
): Promise<HospitalContentCreatePageContext> {
  const actor = await resolveActor();
  const selection = await resolveSelection(actor, requestedHospitalId);
  return { ...selection, recoveryScope: createRecoveryScope(actor) };
}

export async function getHospitalContentDetailPageContext(contentId: string): Promise<HospitalContentDetailPageContext> {
  const actor = await resolveActor();
  try {
    const content = await readHospitalContentForOwner(actor, contentId);
    return { content, requestScope: createRecoveryScope(actor) };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) notFound();
    throw error;
  }
}
