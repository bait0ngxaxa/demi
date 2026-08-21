import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getGoalPlanCreateContextForProgram } from "@/modules/goals/services/goal-query-service";
import { getPatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import { GoalPlanForm } from "../../../../goals/new/goal-plan-form";

export const metadata: Metadata = {
  title: "สร้างแผนสุขภาพ",
};

type NewProgramGoalPlanPageProps = {
  params: Promise<{ relationshipId: string; programId: string }>;
  searchParams: Promise<{ screeningId?: string | string[] }>;
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

export default async function NewProgramGoalPlanPage({
  params,
  searchParams,
}: NewProgramGoalPlanPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId } = await params;
  const query = await searchParams;
  const requestedScreeningId = Array.isArray(query.screeningId)
    ? query.screeningId[0]
    : query.screeningId;
  let programDetail;
  let context;

  try {
    programDetail = await getPatientProgramDetail(actor, relationshipId, programId);
    context = await getGoalPlanCreateContextForProgram(actor, programDetail.programId, {
      requestedScreeningId,
    });
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ConflictError) {
      redirect(
        `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}`,
      );
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return (
    <GoalPlanForm
      latestScreening={
        context.latestScreening
          ? {
              screeningAssessmentId: context.latestScreening.screeningAssessmentId,
              submittedAt: context.latestScreening.submittedAt.toISOString(),
              result: context.latestScreening.result,
            }
          : null
      }
      patient={context.patient}
      scope={{
        kind: "program",
        patientProgramId: context.patientProgramId,
        relationshipId,
      }}
      submissionNonce={randomUUID()}
      template={context.template}
    />
  );
}
