import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH } from "@/modules/patient-assignment/schemas/patient-osm-assignment-schemas";
import {
  getPatientOsmBulkAssignmentView,
  listPatientOsmAssignmentScopes,
  type PatientOsmBulkAssignmentView,
} from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import {
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { PatientOsmBulkAssignmentWorkspace } from "./patient-osm-bulk-assignment-workspace";

export const metadata: Metadata = {
  title: "กำหนด อสม. ให้ผู้ป่วยหลายคน",
};

type PatientOsmBulkAssignmentPageProps = {
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

export default async function PatientOsmBulkAssignmentPage({
  searchParams,
}: PatientOsmBulkAssignmentPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  let scopes;

  try {
    scopes = await listPatientOsmAssignmentScopes(actor);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  if (scopes.length === 0) {
    redirect("/app/patients");
  }

  const params = await searchParams;
  const requestedHospitalId = firstSearchParam(params.hospitalId);
  const selectedScope =
    requestedHospitalId === undefined
      ? scopes[0]
      : scopes.find(({ hospitalId }) => hospitalId === requestedHospitalId);

  if (!selectedScope) {
    redirect("/app/patients/assign-osm");
  }

  const search = firstSearchParam(params.value) ?? "";
  const displaySearch = search.length <= PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH ? search : "";
  let view: PatientOsmBulkAssignmentView | null = null;
  let errorMessage: string | null = null;

  try {
    view = await getPatientOsmBulkAssignmentView(actor, {
      hospitalId: selectedScope.hospitalId,
      value: search,
    });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    if (error instanceof ValidationError) {
      errorMessage = "กรุณาค้นหาชื่อผู้ป่วยด้วยคำค้นหาที่สั้นลง";
    } else {
      throw error;
    }
  }

  return (
    <PatientOsmBulkAssignmentWorkspace
      key={`${selectedScope.hospitalId}:${displaySearch}`}
      errorMessage={errorMessage}
      scopes={scopes}
      search={displaySearch}
      selectedScope={selectedScope}
      view={view}
    />
  );
}
