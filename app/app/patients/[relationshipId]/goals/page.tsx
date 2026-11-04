import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getGoalPlanOverview } from "@/modules/goals/services/goal-query-service";
import { getPatientProgramPageContext } from "@/modules/patient-program/services/patient-program-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { GoalPlanOverviewView } from "./goal-plan-overview-view";

export const metadata: Metadata = {
  title: "ประวัติแผนสุขภาพทั้งหมด",
};

type GoalPlanOverviewPageProps = {
  params: Promise<{ relationshipId: string }>;
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

export default async function GoalPlanOverviewPage({
  params,
}: GoalPlanOverviewPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  let overview;
  let programContext;

  try {
    [overview, programContext] = await Promise.all([
      getGoalPlanOverview(actor, relationshipId),
      getPatientProgramPageContext(actor, relationshipId),
    ]);
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
    <GoalPlanOverviewView
      activeProgram={programContext.active}
      canManage={programContext.canManage}
      overview={overview}
    />
  );
}

