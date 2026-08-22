import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getProgramReportingProjection } from "@/modules/reporting/services/program-report-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { ProgramReportView } from "./program-report-view";

export const metadata: Metadata = {
  title: "รายงานข้อมูลโปรแกรม",
};

type ProgramReportPageProps = {
  params: Promise<{ relationshipId: string; programId: string }>;
  searchParams: Promise<{
    goalCursor?: string | string[];
    followupCursor?: string | string[];
  }>;
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

export default async function PatientProgramReportPage({
  params,
  searchParams,
}: ProgramReportPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId } = await params;
  const rawSearchParams = await searchParams;
  const currentGoalCursor =
    typeof rawSearchParams.goalCursor === "string" ? rawSearchParams.goalCursor : undefined;
  const currentFollowupCursor =
    typeof rawSearchParams.followupCursor === "string" ? rawSearchParams.followupCursor : undefined;

  let report;

  try {
    report = await getProgramReportingProjection(actor, relationshipId, programId, {
      goalPlans: { cursor: rawSearchParams.goalCursor },
      followups: { cursor: rawSearchParams.followupCursor },
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
    <ProgramReportView
      currentFollowupCursor={currentFollowupCursor}
      currentGoalCursor={currentGoalCursor}
      programId={programId}
      relationshipId={relationshipId}
      report={report}
    />
  );
}
