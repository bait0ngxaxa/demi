import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getFollowupHistoryForProgram } from "@/modules/followups/services/followup-query-service";
import { getPatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { ProgramFollowupHistoryView } from "../program-followup-history-view";

export const metadata: Metadata = {
  title: "ประวัติการติดตามผลในโปรแกรม",
};

type ProgramFollowupHistoryPageProps = {
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

export default async function ProgramFollowupHistoryPage({
  params,
}: ProgramFollowupHistoryPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId } = await params;
  let detail;
  let history;

  try {
    detail = await getPatientProgramDetail(actor, relationshipId, programId);
    history = await getFollowupHistoryForProgram(actor, detail.programId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <ProgramFollowupHistoryView detail={detail} history={history} />;
}
