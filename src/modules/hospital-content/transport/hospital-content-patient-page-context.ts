import "server-only";

import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";
import { getPatientHospitalContent, listPatientHospitalContent } from "../services/hospital-content-patient-query-service";
import type { HospitalContentPatientDetail, HospitalContentPatientPage } from "../types/hospital-content-patient-projections";

export type HospitalContentPatientFeedContext = {
  requestId: string;
} & ({ outcome: "READY"; page: HospitalContentPatientPage } | { outcome: "VALIDATION" });

export async function getHospitalContentPatientFeedContext(input: unknown): Promise<HospitalContentPatientFeedContext> {
  try {
    const actor = await getProtectedApplicationActor();
    const page = await listPatientHospitalContent(actor, input);
    return { requestId: randomUUID(), outcome: "READY", page };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    if (error instanceof ValidationError) return { requestId: randomUUID(), outcome: "VALIDATION" };
    throw error;
  }
}

export async function getHospitalContentPatientDetailContext(contentId: string): Promise<{ requestId: string; content: HospitalContentPatientDetail }> {
  try {
    const actor = await getProtectedApplicationActor();
    const content = await getPatientHospitalContent(actor, contentId);
    return { requestId: randomUUID(), content };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
