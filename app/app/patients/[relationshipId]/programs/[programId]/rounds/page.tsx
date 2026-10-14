import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getProgramRoundsOverview } from "@/modules/patient-program-rounds/services/round-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { ProgramRoundsOverviewView } from "./program-rounds-overview-view";

export const metadata: Metadata = {
  title: "ภาพรวมการจัดบริการครั้งที่ 1–6",
};

type ProgramRoundsPageProps = {
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

export default async function ProgramRoundsPage({
  params,
}: ProgramRoundsPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId } = await params;
  let overview;

  try {
    overview = await getProgramRoundsOverview(actor, relationshipId, programId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <ProgramRoundsOverviewView overview={overview} />;
}
