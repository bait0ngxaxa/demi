import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildProgramRoundFacts,
  buildRoundVitalsView,
  programRoundSelect,
  roundFollowupAchievementRate,
} from "@/modules/patient-program-rounds/services/round-query-service";
import { projectRoundReports, type RoundReport } from "../projections/round-report-projection";

/** Internal batch read: callers supply only Program ids already authorized for this report. */
export async function loadRoundReports(
  database: PrismaClient | Prisma.TransactionClient,
  programIds: readonly string[],
): Promise<Map<string, RoundReport[]>> {
  if (programIds.length === 0) {
    return new Map();
  }

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
  const scoreByRound = new Map(
    achieveScores.map((row) => [`${row.patientProgramId}:${row.roundNumber}`, row.score?.toNumber() ?? null]),
  );

  return new Map(
    programs.map((program) => [
      program.id,
      projectRoundReports(buildProgramRoundFacts(program)).map((round) => {
        const vitals = buildRoundVitalsView(program, round.roundNumber, { recorderNames: false });

        return {
          ...round,
          vitals: vitals ? { weight: vitals.weight, bloodSugar: vitals.bloodSugar } : null,
          achieveScore: scoreByRound.get(`${program.id}:${round.roundNumber}`) ?? null,
          followup: roundFollowupAchievementRate(program, round.roundNumber),
        };
      }),
    ]),
  );
}
