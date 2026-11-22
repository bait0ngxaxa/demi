import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getRequestApplicationActor } from "@/modules/auth/services/request-application-actor";
import { preferredDateBounds } from "@/modules/patient-service-requests/domain/patient-service-definitions";
import { listOwnPatientServiceRequests } from "@/modules/patient-service-requests/services/patient-service-request-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientServicesWorkspace } from "./patient-services-workspace";

export const metadata: Metadata = {
  title: "ขอรับบริการ",
};

export default async function PatientServicesPage(): Promise<React.JSX.Element> {
  await connection();

  let relationships: Awaited<ReturnType<typeof listOwnPatientServiceRequests>>;
  try {
    const actor = await getRequestApplicationActor();
    relationships = await listOwnPatientServiceRequests(actor);
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <PatientServicesWorkspace preferredDateBounds={preferredDateBounds(new Date())} relationships={relationships} />;
}
