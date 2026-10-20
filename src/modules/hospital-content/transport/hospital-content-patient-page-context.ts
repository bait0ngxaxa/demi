import "server-only";

import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { HospitalStatus } from "@prisma/client";
import { resolveOwnPatientContext } from "@/modules/patient-self/services/patient-self-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";
import { hospitalContentPatientCategorySchema } from "../schemas/hospital-content-patient-schemas";
import { hospitalContentLocatorSchema } from "../schemas/hospital-content-schemas";
import { getPatientHospitalContent, listPatientHospitalContent } from "../services/hospital-content-patient-query-service";
import type { HospitalContentPatientDetail, HospitalContentPatientPage } from "../types/hospital-content-patient-projections";

const patientFeedRouteRequestSchema = z.object({
  category: hospitalContentPatientCategorySchema.optional(),
  cursor: z.string().min(1).max(2_048).optional(),
  hospital: hospitalContentLocatorSchema.optional(),
}).strict();

export type HospitalContentPatientFeedContext = {
  requestId: string;
  hospitalRelationshipId: string | null;
} & ({ outcome: "READY"; page: HospitalContentPatientPage } | { outcome: "VALIDATION" });

export async function getHospitalContentPatientFeedContext(input: unknown): Promise<HospitalContentPatientFeedContext> {
  try {
    const request = patientFeedRouteRequestSchema.safeParse(input);
    if (!request.success) throw new ValidationError("Patient Content feed request is invalid");

    const actor = await getProtectedApplicationActor();
    let hospitalId: string | undefined;
    let hospitalRelationshipId: string | null = null;
    if (request.data.hospital !== undefined) {
      const patient = await resolveOwnPatientContext(actor);
      if (!patient) throw new ForbiddenError();

      const relationship = patient.hospitalRelationships.find(
        ({ careEndedAt, hospitalStatus, relationshipId }) =>
          relationshipId === request.data.hospital &&
          careEndedAt === null &&
          hospitalStatus === HospitalStatus.ACTIVE,
      );
      if (!relationship) throw new ValidationError("Patient Content Hospital selection is invalid");

      hospitalId = relationship.hospitalId;
      hospitalRelationshipId = relationship.relationshipId;
    }

    const contentRequest = {
      ...(request.data.category === undefined ? {} : { category: request.data.category }),
      ...(request.data.cursor === undefined ? {} : { cursor: request.data.cursor }),
    };
    const page = await listPatientHospitalContent(actor, {
      ...contentRequest,
      ...(hospitalId === undefined ? {} : { hospitalId }),
    });
    return { requestId: randomUUID(), hospitalRelationshipId, outcome: "READY", page };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    if (error instanceof ValidationError) return { requestId: randomUUID(), hospitalRelationshipId: null, outcome: "VALIDATION" };
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
