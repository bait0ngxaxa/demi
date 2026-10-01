import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listManagedHospitalServiceCatalog } from "@/modules/patient-service-requests/services/patient-service-catalog-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { HospitalServiceCatalogWorkspace } from "./hospital-service-catalog-workspace";

export const metadata: Metadata = {
  title: "บริการที่ผู้ป่วยขอได้",
};

export default async function PatientServiceCatalogPage(): Promise<React.JSX.Element> {
  await connection();

  let catalogs: Awaited<ReturnType<typeof listManagedHospitalServiceCatalog>>;
  try {
    const actor = await getProtectedApplicationActor();
    catalogs = await listManagedHospitalServiceCatalog(actor);
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  if (catalogs.length === 0) {
    redirect("/app");
  }

  return <HospitalServiceCatalogWorkspace catalogs={catalogs} />;
}
