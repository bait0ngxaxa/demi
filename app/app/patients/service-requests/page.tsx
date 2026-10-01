import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listHospitalPatientServiceRequests } from "@/modules/patient-service-requests/services/patient-service-request-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { HospitalPatientServiceRequestsWorkspace } from "./hospital-service-requests-workspace";

export const metadata: Metadata = {
  title: "คำขอบริการผู้ป่วย",
};

export default async function HospitalPatientServiceRequestsPage(): Promise<React.JSX.Element> {
  await connection();

  let requests: Awaited<ReturnType<typeof listHospitalPatientServiceRequests>>;
  try {
    const actor = await getProtectedApplicationActor();
    requests = await listHospitalPatientServiceRequests(actor);
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <HospitalPatientServiceRequestsWorkspace requests={requests} />;
}
