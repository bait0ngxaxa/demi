import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  getGoalPlanDetailForProgram,
  getGoalPlanOverviewForProgram,
} from "@/modules/goals/services/goal-query-service";
import { getFollowupHistoryForProgram } from "@/modules/followups/services/followup-query-service";
import { getPatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientProgramDetailView } from "./program-detail-view";

export const metadata: Metadata = {
  title: "รายละเอียดโปรแกรม",
};

type PatientProgramDetailPageProps = {
  params: Promise<{ relationshipId: string; programId: string }>;
};

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

export default async function PatientProgramDetailPage({
  params,
}: PatientProgramDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId } = await params;
  let detail;

  try {
    detail = await getPatientProgramDetail(actor, relationshipId, programId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  let goalPlanOverview;
  let followupHistory;
  let latestGoalPlan = null;

  try {
    [goalPlanOverview, followupHistory] = await Promise.all([
      getGoalPlanOverviewForProgram(actor, detail.programId),
      getFollowupHistoryForProgram(actor, detail.programId),
    ]);

    if (goalPlanOverview.latest) {
      latestGoalPlan = await getGoalPlanDetailForProgram(
        actor,
        detail.programId,
        goalPlanOverview.latest.goalPlanId,
      );
    }
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
    <PatientProgramDetailView
      detail={detail}
      followupHistory={followupHistory}
      goalPlanOverview={goalPlanOverview}
      latestGoalPlan={latestGoalPlan}
    />
  );
}
