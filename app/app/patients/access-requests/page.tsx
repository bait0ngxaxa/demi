import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listHospitalPatientAccessRequests, listHospitalPatientAccessRequestLookupHospitals } from "@/modules/patient-access-requests/services/patient-access-request-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { HospitalPatientAccessRequestsWorkspace } from "./patient-access-requests-workspace";

export const metadata: Metadata = {
  title: "คำขอเปิดใช้งานผู้ป่วย",
};

export default async function HospitalPatientAccessRequestsPage(): Promise<React.JSX.Element> {
  await connection();

  let requests: Awaited<ReturnType<typeof listHospitalPatientAccessRequests>>;
  let hospitals: Awaited<ReturnType<typeof listHospitalPatientAccessRequestLookupHospitals>>;
  try {
    const actor = await getProtectedApplicationActor();
    requests = await listHospitalPatientAccessRequests(actor);
    hospitals = await listHospitalPatientAccessRequestLookupHospitals(actor);
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <HospitalPatientAccessRequestsWorkspace requests={requests} hospitals={hospitals} />;
}
