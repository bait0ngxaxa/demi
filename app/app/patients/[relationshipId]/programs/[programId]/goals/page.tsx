import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getGoalPlanOverviewForProgram } from "@/modules/goals/services/goal-query-service";
import { getPatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { ProgramGoalHistoryView } from "../program-goal-history-view";

export const metadata: Metadata = {
  title: "ประวัติแผนสุขภาพและเป้าหมายในโปรแกรม",
};

type ProgramGoalHistoryPageProps = {
  params: Promise<{ relationshipId: string; programId: string }>;
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

export default async function ProgramGoalHistoryPage({
  params,
}: ProgramGoalHistoryPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId } = await params;
  let detail;
  let overview;

  try {
    detail = await getPatientProgramDetail(actor, relationshipId, programId);
    overview = await getGoalPlanOverviewForProgram(actor, detail.programId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <ProgramGoalHistoryView detail={detail} overview={overview} />;
}
