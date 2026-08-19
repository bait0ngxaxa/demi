import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getGoalPlanCreateContext } from "@/modules/goals/services/goal-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { GoalPlanForm } from "./goal-plan-form";

export const metadata: Metadata = {
  title: "สร้างแผนเป้าหมาย",
};

type NewGoalPlanPageProps = {
  params: Promise<{ relationshipId: string }>;
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

export default async function NewGoalPlanPage({
  params,
  searchParams,
}: NewGoalPlanPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  const query = await searchParams;
  const requestedScreeningId = Array.isArray(query.screeningId)
    ? query.screeningId[0]
    : query.screeningId;
  let context;

  try {
    context = await getGoalPlanCreateContext(actor, relationshipId, {
      requestedScreeningId,
    });
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
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
      relationshipId={relationshipId}
      submissionNonce={randomUUID()}
      template={context.template}
    />
  );
}

