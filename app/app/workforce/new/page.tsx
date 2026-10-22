import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listWorkforceHospitals } from "@/modules/workforce/services/workforce-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { WorkforceNewWorkspace } from "../workforce-new-workspace";

export const metadata: Metadata = { title: "เพิ่มบุคลากร / อสม." };

type WorkforceNewPageProps = {
  searchParams: Promise<{ hospitalId?: string | string[]; step?: string | string[]; kind?: string | string[] }>;
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

export default async function WorkforceNewPage({ searchParams }: WorkforceNewPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const hospitals = await listWorkforceHospitals(actor);
  const firstHospital = hospitals[0];
  if (!firstHospital) redirect("/app");

  const params = await searchParams;
  const scalar = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value;
  const requestedHospitalId = scalar(params.hospitalId);
  const selectedHospital = hospitals.find(({ id }) => id === requestedHospitalId) ?? firstHospital;
  const stepValue = scalar(params.step);
  const step = stepValue === "2" ? 2 : stepValue === "3" ? 3 : 1;
  const kindValue = scalar(params.kind);
  const kind = kindValue === "OSM" ? "OSM" : kindValue === "HOSPITAL_MEMBER" ? "HOSPITAL_MEMBER" : null;

  return <WorkforceNewWorkspace hospitals={hospitals} selectedHospitalId={selectedHospital.id} initialKind={kind} initialStep={step} />;
}
