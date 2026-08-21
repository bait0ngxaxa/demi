import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getFollowupDetailForProgram } from "@/modules/followups/services/followup-query-service";
import { getPatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { FollowupDetailView } from "../../../../followups/[followupId]/followup-detail-view";

export const metadata: Metadata = {
  title: "รายละเอียดการติดตามผลในโปรแกรม",
};

type ProgramFollowupDetailPageProps = {
  params: Promise<{ relationshipId: string; programId: string; followupId: string }>;
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

export default async function ProgramFollowupDetailPage({
  params,
}: ProgramFollowupDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId, followupId } = await params;
  let programDetail;
  let detail;

  try {
    programDetail = await getPatientProgramDetail(actor, relationshipId, programId);
    detail = await getFollowupDetailForProgram(actor, programDetail.programId, followupId);
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
    <FollowupDetailView
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
