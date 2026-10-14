import "server-only";

import { redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { listWorkHospitalContacts } from "../services/hospital-contact-work-query-service";
import type { HospitalWorkContactProjection } from "../types/hospital-contact-projections";

export async function getHospitalWorkContactsPageContext(): Promise<HospitalWorkContactProjection[]> {
  let actor;

  try {
    actor = await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  try {
    return await listWorkHospitalContacts(actor);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}
