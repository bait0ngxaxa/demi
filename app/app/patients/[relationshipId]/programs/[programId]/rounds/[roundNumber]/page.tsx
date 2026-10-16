import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getProgramRoundDetail } from "@/modules/patient-program-rounds/services/round-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
import { toServiceDateOnly } from "@/shared/time/service-date";

import { PatientHealthHistorySection } from "../../../../patient-health-history-section";
import { ProgramRoundDetailView } from "./program-round-detail-view";

export const metadata: Metadata = {
  title: "การจัดบริการรายครั้ง",
};

type ProgramRoundPageProps = {
  params: Promise<{ relationshipId: string; programId: string; roundNumber: string }>;
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

export default async function ProgramRoundPage({
  params,
}: ProgramRoundPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId, roundNumber } = await params;
  let detail;

  try {
    detail = await getProgramRoundDetail(actor, relationshipId, programId, roundNumber);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  // One submission token per rendered form; the services treat a replay of the same token as a no-op.
  const reviewNonces = Object.fromEntries(
    [...detail.activities, ...detail.addOptions].map((row) => [row.toolCode, randomUUID()]),
  );

  return (
    <ProgramRoundDetailView
      healthHistory={<PatientHealthHistorySection actor={actor} relationshipId={relationshipId} showAge={false} />}
      detail={detail}
      reviewNonces={reviewNonces}
      todayServiceDate={toServiceDateOnly(new Date())}
      vitalsNonce={randomUUID()}
    />
  );
}
