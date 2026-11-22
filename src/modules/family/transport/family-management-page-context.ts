import "server-only";

import { redirect } from "next/navigation";

import { getRequestApplicationActor } from "@/modules/auth/services/request-application-actor";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { getFamilyManagementOverview } from "../services/caregiver-relationship-query-service";
import type { FamilyManagementCursor } from "../schemas/caregiver-relationship-schemas";

export async function getFamilyManagementPageContext(
  cursor: FamilyManagementCursor,
): Promise<Awaited<ReturnType<typeof getFamilyManagementOverview>>> {
  try {
    const actor = await getRequestApplicationActor();
    return await getFamilyManagementOverview(actor, cursor);
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
