import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listWorkforce, listWorkforceHospitals } from "@/modules/workforce/services/workforce-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { WorkforceImportWorkspace } from "../workforce-import-workspace";

export const metadata: Metadata = { title: "นำเข้าบุคลากรและพิมพ์ใบเปิดใช้งาน" };

type WorkforceImportPageProps = {
  searchParams: Promise<{
    hospitalId?: string | string[];
    search?: string | string[];
    status?: string | string[];
    staffCursor?: string | string[];
    osmCursor?: string | string[];
  }>;
};

async function resolveActor() {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

export default async function WorkforceImportPage({ searchParams }: WorkforceImportPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const hospitals = await listWorkforceHospitals(actor);
  const firstHospital = hospitals[0];
  if (!firstHospital) redirect("/app");

  const params = await searchParams;
  const scalar = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value;
  const requestedHospitalId = scalar(params.hospitalId);
  const selectedHospital = hospitals.find(({ id }) => id === requestedHospitalId) ?? firstHospital;
  const status = scalar(params.status);
  const workforce = await listWorkforce(actor, {
    targetHospitalId: selectedHospital.id,
    search: scalar(params.search),
    status: status === "PROVISIONED" || status === "INVITED" || status === "ACTIVE" || status === "SUSPENDED" || status === "ENDED" ? status : undefined,
    staffCursor: scalar(params.staffCursor),
    osmCursor: scalar(params.osmCursor),
  });

  return (
    <WorkforceImportWorkspace
      hospitalName={selectedHospital.name}
      hospitals={hospitals}
      key={selectedHospital.id}
      pageInfo={workforce.pageInfo}
      rows={workforce.rows}
      selectedHospitalId={selectedHospital.id}
      serverTime={workforce.pageInfo.serverTime}
    />
  );
}
