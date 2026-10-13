import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { scheduleCurrentLineAccountReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import {
  listWorkforce,
  listWorkforceHospitals,
} from "@/modules/workforce/services/workforce-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { WorkforceWorkspace } from "./workforce-workspace";

export const metadata: Metadata = {
  title: "จัดการบุคลากรโรงพยาบาล",
};

type WorkforcePageProps = {
  searchParams: Promise<{ hospitalId?: string | string[]; search?: string | string[]; status?: string | string[]; staffCursor?: string | string[]; osmCursor?: string | string[] }>;
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

export default async function WorkforcePage({ searchParams }: WorkforcePageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const hospitals = await listWorkforceHospitals(actor);

  if (hospitals.length === 0) {
    redirect("/app");
  }

  await scheduleCurrentLineAccountReconciliation();

  const params = await searchParams;
  const requestedHospitalId = Array.isArray(params.hospitalId)
    ? params.hospitalId[0]
    : params.hospitalId;
  const selectedHospitalId = hospitals.some(({ id }) => id === requestedHospitalId)
    ? requestedHospitalId!
    : hospitals[0].id;
  const scalar = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value;
  const status = scalar(params.status);
  const workforce = await listWorkforce(actor, {
    targetHospitalId: selectedHospitalId,
    search: scalar(params.search),
    status: status === "PROVISIONED" || status === "INVITED" || status === "ACTIVE" || status === "SUSPENDED" ? status : undefined,
    staffCursor: scalar(params.staffCursor), osmCursor: scalar(params.osmCursor),
  });

  return (
    <WorkforceWorkspace
      key={selectedHospitalId}
      hospitals={hospitals}
      selectedHospitalId={selectedHospitalId}
      workforce={workforce}
    />
  );
}
