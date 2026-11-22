import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getRequestApplicationActor } from "@/modules/auth/services/request-application-actor";
import { getFollowupHistory } from "@/modules/followups/services/followup-query-service";
import { getPatientProgramPageContext } from "@/modules/patient-program/services/patient-program-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { FollowupHistoryView } from "./followup-history-view";

export const metadata: Metadata = {
  title: "ประวัติการติดตามผลทั้งหมด",
};

type FollowupHistoryPageProps = {
  params: Promise<{ relationshipId: string }>;
};

async function resolveActor() {
  try {
    return await getRequestApplicationActor();
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

export default async function FollowupHistoryPage({
  params,
}: FollowupHistoryPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  let history;
  let programContext;

  try {
    [history, programContext] = await Promise.all([
      getFollowupHistory(actor, relationshipId),
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
    <FollowupHistoryView
      activeProgram={programContext.active}
      canManage={programContext.canManage}
      history={history}
    />
  );
}
