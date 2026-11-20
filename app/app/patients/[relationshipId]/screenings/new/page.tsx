import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { CURRENT_INSTRUMENT_QUESTION_SETS } from "@/modules/screening/domain/question-sets";
import { screeningInstrumentSchema } from "@/modules/screening/schemas/screening-schemas";
import {
  getProgramRoundsOverview,
  getRoundOneScreeningGap,
  type RoundOneScreeningGap,
} from "@/modules/patient-program-rounds/services/round-query-service";
import { getScreeningPatientForSubmission } from "@/modules/screening/services/screening-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
import { reportUnexpectedError } from "@/shared/errors/unexpected-error-report";

import { RoundOneScreeningAlert } from "./round-one-screening-alert";
import { ScreeningForm } from "./screening-form";

export const metadata: Metadata = {
  title: "แบบประเมินใหม่",
};

type NewScreeningPageProps = {
  params: Promise<{ relationshipId: string }>;
  searchParams: Promise<{ programId?: string | string[]; instrument?: string | string[] }>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** R2-C: PAM and PROMs are recorded separately; without a valid instrument the page offers both. */
function newScreeningHref(relationshipId: string, instrument: "PAM" | "PROMS" | null, programId: string | undefined): string {
  const params = new URLSearchParams();
  if (instrument) params.set("instrument", instrument);
  if (programId) params.set("programId", programId);
  const query = params.toString();
  return `/app/patients/${encodeURIComponent(relationshipId)}/screenings/new${query ? `?${query}` : ""}`;
}

function InstrumentChooser({
  relationshipId,
  programId,
  roundOneHref,
}: {
  relationshipId: string;
  programId: string | undefined;
  roundOneHref: string | null;
}): React.JSX.Element {
  const href = (instrument: "PAM" | "PROMS") => newScreeningHref(relationshipId, instrument, programId);

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[
          { href: `/app/patients/${encodeURIComponent(relationshipId)}/screenings`, label: "ประวัติการประเมิน" },
          { label: "แบบประเมินใหม่" },
        ]}
        description="เลือกแบบประเมินที่จะบันทึก แต่ละแบบบันทึกแยกกัน"
        title="เริ่มแบบประเมินใหม่"
      />
      {roundOneHref ? <div className="pt-8"><RoundOneScreeningAlert href={roundOneHref} /></div> : null}
      <div className="grid gap-4 pt-8 sm:grid-cols-2">
        {(["PAM", "PROMS"] as const).map((instrument) => (
          <Panel key={instrument}>
            <h2 className="text-lg font-semibold leading-7 text-text">
              {CURRENT_INSTRUMENT_QUESTION_SETS[instrument].title}
            </h2>
            <Link
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={href(instrument)}
            >
              ทำแบบประเมิน {instrument === "PAM" ? "PAM" : "PROMs"}
            </Link>
          </Panel>
        ))}
      </div>
    </div>
  );
}

const PROGRAM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

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

/**
 * The round-1 hint is optional: the form never depended on a Program read, so any failure (no Program read
 * scope, an unknown Program, an infrastructure error) renders the form without it. Only a lost session stops.
 */
async function findRoundOneScreeningGap(
  actor: Awaited<ReturnType<typeof resolveActor>>,
  relationshipId: string,
  instrument: "PAM" | "PROMS" | null,
): Promise<RoundOneScreeningGap | null> {
  try {
    return await getRoundOneScreeningGap(actor, relationshipId, instrument);
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) throw error;
    if (!(error instanceof ForbiddenError) && !(error instanceof NotFoundError)) {
      reportUnexpectedError("screening.newScreeningPage.roundOneHint", error);
    }
    return null;
  }
}

export default async function NewScreeningPage({
  params,
  searchParams,
}: NewScreeningPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  const { programId: requestedProgramId, instrument: requestedInstrument } = await searchParams;
  const programIdCandidate = firstValue(requestedProgramId);
  const instrument = screeningInstrumentSchema.safeParse(firstValue(requestedInstrument));
  // The service re-authorizes the Program; a malformed value is simply ignored here.
  const programId =
    programIdCandidate && PROGRAM_ID_PATTERN.test(programIdCandidate)
      ? programIdCandidate.toLowerCase()
      : undefined;
  let patient;
  let programRoundNumber = 1;
  let roundOneGap: RoundOneScreeningGap | null = null;

  try {
    patient = await getScreeningPatientForSubmission(actor, relationshipId);
    if (programId) {
      const overview = await getProgramRoundsOverview(actor, relationshipId, programId);
      programRoundNumber = overview.rounds.find((round) => round.state !== "COMPLETED" && round.state !== "LOCKED")?.roundNumber ?? 1;
    } else {
      roundOneGap = await findRoundOneScreeningGap(actor, relationshipId, instrument.success ? instrument.data : null);
    }
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  const roundOneHref = roundOneGap
    ? newScreeningHref(relationshipId, instrument.success ? instrument.data : null, roundOneGap.patientProgramId)
    : null;

  if (!instrument.success) {
    return <InstrumentChooser programId={programId} relationshipId={relationshipId} roundOneHref={roundOneHref} />;
  }

  return (
    <ScreeningForm
      patient={patient}
      programId={programId}
      programRoundNumber={programRoundNumber}
      questionSet={CURRENT_INSTRUMENT_QUESTION_SETS[instrument.data]}
      relationshipId={relationshipId}
      roundOneHref={roundOneHref}
      submissionNonce={randomUUID()}
    />
  );
}
