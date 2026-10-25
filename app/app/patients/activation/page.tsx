import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  getPatientActivationCandidateForRelationship,
  listPatientActivationScopes,
} from "@/modules/patient-activation/services/patient-activation-query-service";
import type {
  PatientActivationCandidate,
  PatientActivationScope,
} from "@/modules/patient-activation/services/patient-activation-query-service";
import type { PatientActivationCandidateState } from "@/modules/patient-activation/transport/action-state";
import { ForbiddenError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";

import { PatientActivationActionsWorkspace } from "./patient-activation-actions-workspace";

export const metadata: Metadata = {
  title: "เปิดใช้งานบัญชีผู้ป่วย",
};

type PatientActivationPageProps = {
  searchParams: Promise<{ hospitalId?: string | string[]; relationshipId?: string | string[] }>;
};

function scalar(value: string | string[] | undefined): string | undefined {
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
  if (
    (Array.isArray(params.hospitalId) && params.hospitalId.length !== 1) ||
    (Array.isArray(params.relationshipId) && params.relationshipId.length !== 1)
  ) notFound();

  const requestedHospitalId = scalar(params.hospitalId);
  const relationshipId = scalar(params.relationshipId);
  const selectedScope = relationshipId
    ? scopes.find(({ hospitalId }) => hospitalId === requestedHospitalId)
    : scopes.find(({ hospitalId }) => hospitalId === requestedHospitalId) ?? scopes[0];
  if (!selectedScope) notFound();

  let contextualCandidate: PatientActivationCandidateState | null = null;
  if (relationshipId) {
    let candidate: PatientActivationCandidate | null;
    try {
      candidate = await getPatientActivationCandidateForRelationship(actor, {
        targetHospitalId: selectedScope.hospitalId,
        patientHospitalRelationshipId: relationshipId,
      });
    } catch (error: unknown) {
      if (error instanceof ValidationError || error instanceof ForbiddenError) notFound();
      throw error;
    }
    if (!candidate) notFound();
    contextualCandidate = {
      ...candidate,
      activationExpiresAt: candidate.activationExpiresAt?.toISOString() ?? null,
    };
  }

  return (
    <PatientActivationActionsWorkspace
      key={selectedScope.hospitalId}
      scopes={scopes}
      selectedHospitalId={selectedScope.hospitalId}
      selectedScope={selectedScope}
      contextualCandidate={contextualCandidate}
      contextualPatientHref={relationshipId ? `/app/patients/${encodeURIComponent(relationshipId)}` : null}
    />
  );
}
