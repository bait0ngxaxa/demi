import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getGoalPlanDetailForProgram } from "@/modules/goals/services/goal-query-service";
import { getPatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { GoalPlanDetailView } from "../../../../goals/goal-plan-detail-view";

export const metadata: Metadata = {
  title: "รายละเอียดแผนสุขภาพในโปรแกรม",
};

type ProgramGoalPlanDetailPageProps = {
  params: Promise<{ relationshipId: string; programId: string; goalPlanId: string }>;
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

export default async function ProgramGoalPlanDetailPage({
  params,
}: ProgramGoalPlanDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId, goalPlanId } = await params;
  let programDetail;
  let detail;

  try {
    programDetail = await getPatientProgramDetail(actor, relationshipId, programId);
    detail = await getGoalPlanDetailForProgram(actor, programDetail.programId, goalPlanId);
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
      scope={{
        canManage: programDetail.canManage,
        kind: "program",
        patientProgramId: programDetail.programId,
        programStatus: programDetail.status,
        relationshipId,
      }}
    />
  );
}
