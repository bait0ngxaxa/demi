import "server-only";

import { notFound, redirect } from "next/navigation";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";
import { getHospitalWorkContent, listHospitalWorkContent } from "../services/hospital-content-work-query-service";

export async function getHospitalWorkContentPageContext(cursor?: string, hospitalId?: string) {
  let actor;
  try { actor = await getProtectedApplicationActor(); }
  catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
  try {
    return await listHospitalWorkContent(actor, {
      ...(cursor === undefined ? {} : { cursor }),
      ...(hospitalId === undefined ? {} : { hospitalId }),
    });
  }
  catch (error: unknown) {
    if (error instanceof ForbiddenError) redirect("/app");
    if (error instanceof ValidationError) redirect("/app/hospitals/content");
    throw error;
  }
}

export async function getHospitalWorkContentDetailContext(contentId: string) {
  let actor;
  try { actor = await getProtectedApplicationActor(); }
  catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
  try { return await getHospitalWorkContent(actor, contentId); }
  catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }
}
