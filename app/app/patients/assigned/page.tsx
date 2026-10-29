import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";
import {
  LINE_WEB_NAVIGATION_PATHS,
  type LineQuickActionReturnPath,
} from "@/modules/line/domain/line-navigation-intents";
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

const assignedPatientTaskModeSchema = z.enum(["screening"]);
type AssignedPatientTaskMode = z.infer<typeof assignedPatientTaskModeSchema>;

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * CT-3: the former "รอติดตาม" queue is the จัดบริการ workspace. LINE messages and rich menus already sent still
 * open the old URL, so it redirects with the same Hospital locator (the workspace re-checks it against its scopes).
 */
function legacyFollowupTaskRedirect(params: Record<string, string | string[] | undefined>): string | null {
  if (firstSearchParam(params.task) !== "followup") return null;
  const hospitalId = firstSearchParam(params.hospitalId);
  return hospitalId ? `/app/services?${new URLSearchParams({ hospitalId }).toString()}` : "/app/services";
}

function parseTaskMode(value: string | string[] | undefined): AssignedPatientTaskMode | null {
  if (typeof value !== "string") return null;
  const parsed = assignedPatientTaskModeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function resolveActor(returnTo: LineQuickActionReturnPath) {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect(buildLoginReturnHref(returnTo));
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
  const params = await searchParams;
  const legacyRedirect = legacyFollowupTaskRedirect(params);

  if (legacyRedirect) {
    redirect(legacyRedirect);
  }

  const taskMode = parseTaskMode(params.task);
  const returnTo = taskMode === "screening"
    ? LINE_WEB_NAVIGATION_PATHS.START_OSM_SCREENING
    : LINE_WEB_NAVIGATION_PATHS.OPEN_OSM_ASSIGNED_PATIENTS;
  const actor = await resolveActor(returnTo);
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
      // Only narrows the assignment predicate inside the service; the bottom tabs never send it.
      hospitalId: firstSearchParam(params.hospitalId),
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
      taskMode={taskMode}
      value={result?.value ?? displayValue}
    />
  );
}
