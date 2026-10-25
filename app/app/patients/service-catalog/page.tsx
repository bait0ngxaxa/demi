import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listManagedHospitalServiceCatalog } from "@/modules/patient-service-requests/services/patient-service-catalog-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { HospitalServiceCatalogWorkspace } from "./hospital-service-catalog-workspace";

export const metadata: Metadata = {
  title: "บริการที่ผู้ป่วยขอได้",
};

type PatientServiceCatalogPageProps = {
  searchParams: Promise<{ hospitalId?: string | string[] }>;
};

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PatientServiceCatalogPage({ searchParams }: PatientServiceCatalogPageProps): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;
  if (Array.isArray(params.hospitalId) && params.hospitalId.length !== 1) notFound();
  const requestedHospitalId = scalar(params.hospitalId);

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

  const visibleCatalogs = requestedHospitalId
    ? catalogs.filter(({ hospitalId }) => hospitalId === requestedHospitalId)
    : catalogs;
  if (visibleCatalogs.length === 0) notFound();

  return <HospitalServiceCatalogWorkspace catalogs={visibleCatalogs} />;
}
