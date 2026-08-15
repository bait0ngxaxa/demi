import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  listPatientActivationScopes,
} from "@/modules/patient-activation/services/patient-activation-query-service";
import type { PatientActivationScope } from "@/modules/patient-activation/services/patient-activation-query-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientActivationActionsWorkspace } from "./patient-activation-actions-workspace";

export const metadata: Metadata = {
  title: "เปิดใช้งานบัญชีผู้ป่วย",
};

type PatientActivationPageProps = {
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

export default async function PatientActivationPage({
  searchParams,
}: PatientActivationPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  let scopes: PatientActivationScope[];

  try {
    scopes = await listPatientActivationScopes(actor);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  if (scopes.length === 0) {
    redirect("/app");
  }

  const params = await searchParams;
  const requestedHospitalId = Array.isArray(params.hospitalId)
    ? params.hospitalId[0]
    : params.hospitalId;
  const selectedScope = scopes.find(({ hospitalId }) => hospitalId === requestedHospitalId) ?? scopes[0];

  return (
    <PatientActivationActionsWorkspace
      scopes={scopes}
      selectedHospitalId={selectedScope.hospitalId}
      selectedScope={selectedScope}
    />
  );
}
