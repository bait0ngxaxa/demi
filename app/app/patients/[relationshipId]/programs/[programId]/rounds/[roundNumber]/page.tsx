import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { nextRoundStep, roundStepKey, ROUND_SUMMARY_STEP } from "@/modules/patient-program-rounds/domain/round-steps";
import { buildRoundStepPath } from "@/modules/patient-program-rounds/presentation/round-labels";
import { getProgramRoundDetail } from "@/modules/patient-program-rounds/services/round-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
import { toServiceDateOnly } from "@/shared/time/service-date";

import { PatientHealthHistorySection } from "../../../../patient-health-history-section";
import { ProgramRoundDetailView, type RoundCurrentStep } from "./program-round-detail-view";

export const metadata: Metadata = {
  title: "การจัดบริการรายครั้ง",
};

type ProgramRoundPageProps = {
  params: Promise<{ relationshipId: string; programId: string; roundNumber: string }>;
  searchParams: Promise<{ step?: string | string[]; after?: string | string[] }>;
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

function single(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export default async function ProgramRoundPage({
  params,
  searchParams,
}: ProgramRoundPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId, roundNumber } = await params;
  const query = await searchParams;
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

  const steps = detail.status.steps;
  const isStep = (code: string | null): code is RoundCurrentStep =>
    code === ROUND_SUMMARY_STEP || steps.some((step) => roundStepKey(step) === code);
  const after = single(query.after);

  // SR-D7: after a save the stepper lands on the next unresolved step (or the summary).
  if (after !== null && isStep(after)) {
    redirect(
      buildRoundStepPath(
        detail.patientHospitalRelationshipId,
        detail.patientProgramId,
        detail.roundNumber,
        nextRoundStep(steps, after),
      ),
    );
  }

  const requested = single(query.step);
  const currentStep: RoundCurrentStep = isStep(requested) ? requested : nextRoundStep(steps, null);

  // One submission token per rendered form; the services treat a replay of the same token as a no-op.
  return (
    <ProgramRoundDetailView
      currentStep={currentStep}
      detail={detail}
      healthHistory={<PatientHealthHistorySection actor={actor} relationshipId={relationshipId} showAge={false} />}
      nonces={{
        vitals: randomUUID(),
        completion: randomUUID(),
        review: { PAM: randomUUID(), PROMS: randomUUID(), HEALTH_PATH: randomUUID() },
      }}
      todayServiceDate={toServiceDateOnly(new Date())}
    />
  );
}
