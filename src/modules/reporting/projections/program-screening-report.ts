import type { Prisma, ScreeningInstrument } from "@prisma/client";

import { parseScreeningOutcome, screeningAnswersInstrument } from "@/modules/screening/domain/screening-outcome";

/** R2-C / RPT-01: the one Program screening read shared by the Hospital workbook and the exact-Program report. */
export const programScreeningReportSelect = {
  orderBy: { submittedAt: "asc" },
  select: { submittedAt: true, instrument: true, scoringVersion: true, result: true },
} satisfies Prisma.PatientProgramSelect["screeningAssessments"];

export type ProgramScreeningReportSource = {
  submittedAt: Date;
  instrument: ScreeningInstrument;
  scoringVersion: string;
  result: Prisma.JsonValue;
};

type ScreeningReportRecord<T> = { state: "PRESENT"; value: T } | { state: "MISSING" };

/**
 * PAM = total score. PROMs = มีปัญหา/ไม่มีปัญหา (Q6); a legacy combined screening answers both and
 * keeps its PROMs total. Timestamps are ISO strings so both reports emit identical values.
 */
export type ProgramScreeningReport = {
  pam: ScreeningReportRecord<{ submittedAt: string; score: number }>;
  proms: ScreeningReportRecord<
    { submittedAt: string; hasProblem: boolean } | { submittedAt: string; legacyTotal: number }
  >;
};

/** R2-C: each instrument's result is mapped explicitly; the earliest readable screening answering it wins. */
export function toProgramScreeningReport(
  screenings: readonly ProgramScreeningReportSource[],
): ProgramScreeningReport {
  const outcomeFor = (step: "PAM" | "PROMS") => {
    const screening = screenings.find((candidate) => screeningAnswersInstrument(candidate.instrument, step));
    const outcome = screening
      ? parseScreeningOutcome(screening.instrument, screening.scoringVersion, screening.result)
      : null;

    return screening && outcome ? { submittedAt: screening.submittedAt.toISOString(), outcome } : null;
  };
  const pam = outcomeFor("PAM");
  const proms = outcomeFor("PROMS");

  return {
    pam:
      pam?.outcome.kind === "PAM"
        ? { state: "PRESENT", value: { submittedAt: pam.submittedAt, score: pam.outcome.total } }
        : pam?.outcome.kind === "LEGACY"
          ? { state: "PRESENT", value: { submittedAt: pam.submittedAt, score: pam.outcome.pamTotal } }
          : { state: "MISSING" },
    proms:
      proms?.outcome.kind === "PROMS"
        ? { state: "PRESENT", value: { submittedAt: proms.submittedAt, hasProblem: proms.outcome.hasProblem } }
        : proms?.outcome.kind === "LEGACY"
          ? { state: "PRESENT", value: { submittedAt: proms.submittedAt, legacyTotal: proms.outcome.promsTotal } }
          : { state: "MISSING" },
  };
}
