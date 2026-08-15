import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listPatientProvisioningScopes } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientProvisioningWorkspace } from "./patient-provisioning-workspace";

export const metadata: Metadata = {
  title: "เพิ่มผู้ป่วย",
};

type PatientProvisioningPageProps = {
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

export default async function PatientProvisioningPage({
  searchParams,
}: PatientProvisioningPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const scopes = await listPatientProvisioningScopes(actor);

  if (scopes.length === 0) {
    redirect("/app");
  }

  const params = await searchParams;
  const requestedHospitalId = Array.isArray(params.hospitalId)
    ? params.hospitalId[0]
    : params.hospitalId;
  const requestedScope = scopes.find(({ hospitalId }) => hospitalId === requestedHospitalId);
  const selectedHospitalId = requestedScope?.hospitalId ?? scopes[0].hospitalId;
  const selectedScope = scopes.find(({ hospitalId }) => hospitalId === selectedHospitalId);

  if (!selectedScope) {
    redirect("/app");
  }

  return (
    <PatientProvisioningWorkspace
      scopes={scopes}
      selectedHospitalId={selectedHospitalId}
      selectedScope={selectedScope}
    />
  );
}
