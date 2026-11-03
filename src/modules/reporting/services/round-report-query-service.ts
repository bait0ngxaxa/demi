import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildProgramRoundFacts,
  buildRoundVitalsView,
  programRoundSelect,
  roundFollowupAchievementRate,
  type ProgramRoundRecord,
  type RoundReadOptions,
  type RoundVitalsView,
} from "@/modules/patient-program-rounds/services/round-query-service";
import { projectRoundReports, type RoundReport } from "../projections/round-report-projection";

type RoundReportDatabase = PrismaClient | Prisma.TransactionClient;

/** RPT-01: one opened round's vitals, from the same round VITALS evidence precedence as the round stepper. */
export type ProgramRoundVitalsReport = {
  roundNumber: number;
  vitals: RoundVitalsView | null;
};

export type ProgramRoundReport = {
  rounds: RoundReport[];
  roundVitals: ProgramRoundVitalsReport[];
};

const REPORT_ROUND_READ: RoundReadOptions = { recorderNames: false };

async function loadRoundSources(
  database: RoundReportDatabase,
  programIds: readonly string[],
): Promise<{ programs: ProgramRoundRecord[]; scoreByRound: Map<string, number | null> }> {
  const [programs, achieveScores] = await Promise.all([
    database.patientProgram.findMany({
      where: { id: { in: [...programIds] } },
      select: programRoundSelect,
    }),
    // AS-1: staff-entered scores are read only here, never through the shared round projection.
    database.patientProgramRoundAchieveScore.findMany({
      where: { patientProgramId: { in: [...programIds] }, score: { not: null } },
      select: { patientProgramId: true, roundNumber: true, score: true },
    }),
  ]);

  return {
    programs,
    scoreByRound: new Map(
      achieveScores.map((row) => [`${row.patientProgramId}:${row.roundNumber}`, row.score?.toNumber() ?? null]),
    ),
  };
}

function toRoundReports(program: ProgramRoundRecord, scoreByRound: Map<string, number | null>): RoundReport[] {
  return projectRoundReports(buildProgramRoundFacts(program)).map((round) => {
    const vitals = buildRoundVitalsView(program, round.roundNumber, REPORT_ROUND_READ);

    return {
      ...round,
      vitals: vitals ? { weight: vitals.weight, bloodSugar: vitals.bloodSugar } : null,
      achieveScore: scoreByRound.get(`${program.id}:${round.roundNumber}`) ?? null,
      followup: roundFollowupAchievementRate(program, round.roundNumber),
    };
  });
}

/** Internal batch read: callers supply only Program ids already authorized for this report. */
export async function loadRoundReports(
  database: RoundReportDatabase,
  programIds: readonly string[],
): Promise<Map<string, RoundReport[]>> {
  if (programIds.length === 0) {
    return new Map();
  }

  const { programs, scoreByRound } = await loadRoundSources(database, programIds);

  return new Map(programs.map((program) => [program.id, toRoundReports(program, scoreByRound)]));
}

/**
 * Internal read for one already-authorized Program: its round reports and, from the same load, every opened
 * round's full vitals. `options` decides the recorder provenance the viewer may see.
 */
export async function loadProgramRoundReport(
  database: RoundReportDatabase,
  programId: string,
  options: RoundReadOptions,
): Promise<ProgramRoundReport> {
  const { programs, scoreByRound } = await loadRoundSources(database, [programId]);
  const program = programs.find((candidate) => candidate.id === programId);

  if (!program) {
    return { rounds: [], roundVitals: [] };
  }

  const rounds = toRoundReports(program, scoreByRound);

  return {
    rounds,
    roundVitals: rounds.map((round) => ({
      roundNumber: round.roundNumber,
      vitals: buildRoundVitalsView(program, round.roundNumber, options),
    })),
  };
}
