import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  listWorkforce,
  listWorkforceOwnerHospitals,
} from "@/modules/workforce/services/workforce-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { WorkforceWorkspace } from "./workforce-workspace";

export const metadata: Metadata = {
  title: "จัดการบุคลากรโรงพยาบาล",
};

type WorkforcePageProps = {
  searchParams: Promise<{ hospitalId?: string | string[] }>;
};

async function resolveActor() {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

export default async function WorkforcePage({ searchParams }: WorkforcePageProps) {
  await connection();
  const actor = await resolveActor();
  const hospitals = await listWorkforceOwnerHospitals(actor);

  if (hospitals.length === 0) {
    redirect("/app");
  }

  const params = await searchParams;
  const requestedHospitalId = Array.isArray(params.hospitalId)
    ? params.hospitalId[0]
    : params.hospitalId;
  const selectedHospitalId = hospitals.some(({ id }) => id === requestedHospitalId)
    ? requestedHospitalId!
    : hospitals[0].id;
  const workforce = await listWorkforce(actor, { targetHospitalId: selectedHospitalId });

  return (
    <WorkforceWorkspace
      hospitals={hospitals}
      selectedHospitalId={selectedHospitalId}
      workforce={workforce}
    />
  );
}
