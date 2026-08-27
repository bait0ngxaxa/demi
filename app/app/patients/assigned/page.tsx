import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  findAssignedPatientDirectory,
  type PatientAssignedDirectoryPage,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import {
  PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH,
  PATIENT_DIRECTORY_NAME_MAX_LENGTH,
  type PatientDirectoryClassificationFilter,
  type PatientDirectoryLookupType,
} from "@/modules/patient-directory/schemas/patient-directory-schemas";
import { ForbiddenError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";

import { AssignedPatientDirectoryView } from "./assigned-patient-directory-view";

export const metadata: Metadata = {
  title: "ผู้ป่วยที่รับผิดชอบ",
};

type AssignedPatientDirectoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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

function getValidationMessage(error: unknown): string | null {
  return error instanceof ValidationError
    ? "กรุณาตรวจสอบประเภทและความยาวของคำค้นหา แล้วลองใหม่อีกครั้ง"
    : null;
}

export default async function AssignedPatientDirectoryPage({
  searchParams,
}: AssignedPatientDirectoryPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const params = await searchParams;
  const requestedLookupType = firstSearchParam(params.lookupType);
  const lookupType: PatientDirectoryLookupType =
    requestedLookupType === "HOSPITAL_NUMBER" ? "HOSPITAL_NUMBER" : "NAME";
  const requestedValue = firstSearchParam(params.value) ?? "";
  const maxLength =
    lookupType === "HOSPITAL_NUMBER"
      ? PATIENT_DIRECTORY_HOSPITAL_NUMBER_MAX_LENGTH
      : PATIENT_DIRECTORY_NAME_MAX_LENGTH;
  const displayValue = requestedValue.length <= maxLength ? requestedValue : "";
  const requestedClassification = firstSearchParam(params.classification);
  const classificationFilter: PatientDirectoryClassificationFilter =
    requestedClassification === "RISK" || requestedClassification === "DIABETES"
      ? requestedClassification
      : "ALL";

  let result: PatientAssignedDirectoryPage | null = null;
  let errorMessage: string | null = null;

  try {
    result = await findAssignedPatientDirectory(actor, {
      lookupType,
      value: requestedValue,
      page: firstSearchParam(params.page) ?? "1",
      classification: classificationFilter,
    });
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
    <AssignedPatientDirectoryView
      errorMessage={errorMessage}
      lookupType={result?.lookupType ?? lookupType}
      result={result}
      classificationFilter={result?.classificationFilter ?? classificationFilter}
      value={result?.value ?? displayValue}
    />
  );
}
