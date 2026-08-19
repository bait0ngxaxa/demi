import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getFollowupDetail } from "@/modules/followups/services/followup-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { FollowupDetailView } from "./followup-detail-view";

export const metadata: Metadata = {
  title: "รายละเอียดการติดตามผล",
};

type FollowupDetailPageProps = {
  params: Promise<{ relationshipId: string; followupId: string }>;
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

export default async function FollowupDetailPage({
  params,
}: FollowupDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, followupId } = await params;
  let detail;

  try {
    detail = await getFollowupDetail(actor, relationshipId, followupId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <FollowupDetailView detail={detail} />;
}
