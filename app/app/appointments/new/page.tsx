import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  findAssignedPatientDirectory,
  findPatientDirectory,
  type PatientDirectoryItem,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import type { PatientDirectoryLookupType } from "@/modules/patient-directory/schemas/patient-directory-schemas";
import {
  listWorkAppointmentScopes,
  type WorkAppointmentHospitalScope,
} from "@/modules/appointments/services/work-appointment-query-service";
import {
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { AppointmentPatientPicker } from "./patient-picker-view";

export const metadata: Metadata = {
  title: "เลือกผู้ป่วยเพื่อสร้างนัด",
};

type AppointmentPatientPickerPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function resolveActor() {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

function validationMessage(error: unknown): string | null {
  return error instanceof ValidationError
    ? "กรุณาตรวจสอบประเภทและความยาวของคำค้นหา แล้วลองอีกครั้ง"
    : null;
}

export default async function AppointmentPatientPickerPage({
  searchParams,
}: AppointmentPatientPickerPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const params = await searchParams;
  let scopes: WorkAppointmentHospitalScope[];
  try {
    scopes = (await listWorkAppointmentScopes(actor)).filter((scope) => scope.canCreate);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }

  const requestedHospitalId = firstSearchParam(params.hospitalId);
  const selectedScope = scopes.find(({ hospitalId }) => hospitalId === requestedHospitalId) ?? scopes[0] ?? null;
  const requestedLookupType = firstSearchParam(params.lookupType);
  const lookupType: PatientDirectoryLookupType = requestedLookupType === "HOSPITAL_NUMBER"
    ? "HOSPITAL_NUMBER"
    : "NAME";
  const value = firstSearchParam(params.value) ?? "";
  const page = firstSearchParam(params.page) ?? "1";
  let items: PatientDirectoryItem[] = [];
  let total = 0;
  let currentPage = 1;
  let totalPages = 1;
  let errorMessage: string | null = null;

  if (selectedScope) {
    try {
      const query = { lookupType, value, page, hospitalId: selectedScope.hospitalId };
      const result = selectedScope.access === "OSM"
        ? await findAssignedPatientDirectory(actor, query)
        : await findPatientDirectory(actor, {
            targetHospitalId: selectedScope.hospitalId,
            lookupType,
            value,
            page,
          });
      items = result.items;
      total = result.total;
      currentPage = result.page;
      totalPages = result.totalPages;
    } catch (error: unknown) {
      if (error instanceof ForbiddenError) redirect("/app");
      errorMessage = validationMessage(error);
      if (!errorMessage) throw error;
    }
  }

  return (
    <AppointmentPatientPicker
      currentPage={currentPage}
      errorMessage={errorMessage}
      items={items}
      lookupType={lookupType}
      scopes={scopes}
      selectedScope={selectedScope}
      total={total}
      totalPages={totalPages}
      value={value}
    />
  );
}
