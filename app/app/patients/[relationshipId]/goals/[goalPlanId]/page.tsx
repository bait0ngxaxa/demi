import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getGoalPlanDetail } from "@/modules/goals/services/goal-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { GoalPlanDetailView } from "../goal-plan-detail-view";

export const metadata: Metadata = {
  title: "รายละเอียดแผนเป้าหมาย",
};

type GoalPlanDetailPageProps = {
  params: Promise<{ relationshipId: string; goalPlanId: string }>;
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

export default async function GoalPlanDetailPage({
  params,
}: GoalPlanDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, goalPlanId } = await params;
  let detail;

  try {
    detail = await getGoalPlanDetail(actor, relationshipId, goalPlanId);
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
    <GoalPlanDetailView
      detail={detail}
      scope={{ kind: "relationship", relationshipId }}
    />
  );
}
