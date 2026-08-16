import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  PATIENT_DIRECTORY_NAME_MAX_LENGTH,
  type PatientDirectoryLookupType,
} from "@/modules/patient-directory/schemas/patient-directory-schemas";
import {
  findPatientDirectory,
  listPatientDirectoryScopes,
  type PatientDirectoryPage,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import {
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { PatientDirectoryView } from "./patient-directory-view";

export const metadata: Metadata = {
  title: "รายชื่อผู้ป่วย",
};

type PatientDirectoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function resolveActor(): Promise<ActorContext> {
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

function getValidationMessage(error: unknown): string | null {
  if (error instanceof ValidationError) {
    return "กรุณาตรวจสอบประเภทและความยาวของคำค้นหา แล้วลองใหม่อีกครั้ง";
  }

  return null;
}

export default async function PatientDirectoryPage({
  searchParams,
}: PatientDirectoryPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  let scopes;

  try {
    scopes = await listPatientDirectoryScopes(actor);
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
  const requestedHospitalId = firstSearchParam(params.hospitalId);
  const selectedScope =
    requestedHospitalId === undefined
      ? scopes[0]
      : scopes.find(({ hospitalId }) => hospitalId === requestedHospitalId);

  if (!selectedScope) {
    redirect("/app/patients");
  }

  const requestedLookupType = firstSearchParam(params.lookupType);
  const lookupType: PatientDirectoryLookupType =
    requestedLookupType === "HOSPITAL_NUMBER" ? "HOSPITAL_NUMBER" : "NAME";
  const requestedValue = firstSearchParam(params.value) ?? "";
  const displayValue =
    requestedValue.length <= PATIENT_DIRECTORY_NAME_MAX_LENGTH ? requestedValue : "";
  const queryInput = {
    targetHospitalId: selectedScope.hospitalId,
    lookupType: requestedLookupType ?? "NAME",
    value: requestedValue,
    page: firstSearchParam(params.page) ?? "1",
  };

  let result: PatientDirectoryPage | null = null;
  let errorMessage: string | null = null;

  try {
    result = await findPatientDirectory(actor, queryInput);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    errorMessage = getValidationMessage(error);

    if (!errorMessage) {
      throw error;
    }
  }

  return (
    <PatientDirectoryView
      key={selectedScope.hospitalId}
      errorMessage={errorMessage}
      lookupType={result?.lookupType ?? lookupType}
      result={result}
      scopes={scopes}
      selectedScope={selectedScope}
      value={result?.value ?? displayValue}
    />
  );
}
