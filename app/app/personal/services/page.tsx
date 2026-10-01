import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listOwnPatientServiceRequests } from "@/modules/patient-service-requests/services/patient-service-request-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientServicesWorkspace } from "./patient-services-workspace";

export const metadata: Metadata = {
  title: "บริการของฉัน",
};

export default async function PatientServicesPage(): Promise<React.JSX.Element> {
  await connection();

  let relationships: Awaited<ReturnType<typeof listOwnPatientServiceRequests>>;
  try {
    const actor = await getProtectedApplicationActor();
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

  return <PatientServicesWorkspace relationships={relationships} />;
}
