import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  getPatientOsmAssignmentManagementView,
  listPatientOsmCandidates,
} from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import {
  PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH,
} from "@/modules/patient-assignment/schemas/patient-osm-assignment-schemas";
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";

import { PatientOsmAssignmentWorkspace } from "./patient-osm-assignment-workspace";

export const metadata: Metadata = {
  title: "จัดการการมอบหมายผู้ป่วย",
};

type PatientOsmAssignmentPageProps = {
  params: Promise<{ relationshipId: string }>;
  searchParams: Promise<{ value?: string | string[] }>;
};

function firstSearchParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

export default async function PatientOsmAssignmentPage({
  params,
  searchParams,
}: PatientOsmAssignmentPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  const search = firstSearchParam((await searchParams).value);
  const displaySearch = search.length <= PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH ? search : "";

  let view;

  try {
    view = await getPatientOsmAssignmentManagementView(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  let candidates = [] as Awaited<ReturnType<typeof listPatientOsmCandidates>>;
  let candidateError: string | null = null;

  try {
    candidates = await listPatientOsmCandidates(actor, {
      patientHospitalRelationshipId: relationshipId,
      value: search,
    });
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      redirect("/app");
    }

    if (error instanceof ValidationError) {
      candidateError = "กรุณาค้นหาชื่อ อสม. ด้วยคำค้นหาที่สั้นลง";
    } else {
      throw error;
    }
  }

  return (
    <PatientOsmAssignmentWorkspace
      candidateError={candidateError}
      candidateSearch={view ? displaySearch : ""}
      candidates={candidates}
      currentAssignment={
        view.currentAssignment
          ? {
              ...view.currentAssignment,
              assignedAt: view.currentAssignment.assignedAt.toISOString(),
            }
          : null
      }
      patient={view.patient}
      relationshipId={relationshipId}
    />
  );
}
