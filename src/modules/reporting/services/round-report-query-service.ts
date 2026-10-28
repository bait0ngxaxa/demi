import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { buildProgramRoundFacts, buildRoundVitalsView, programRoundSelect } from "@/modules/patient-program-rounds/services/round-query-service";
import { projectRoundReports, type RoundReport } from "../projections/round-report-projection";

/** Internal batch read: callers supply only Program ids already authorized for this report. */
export async function loadRoundReports(database: PrismaClient | Prisma.TransactionClient, programIds: readonly string[]): Promise<Map<string, RoundReport[]>> {
  if (programIds.length === 0) return new Map();
  const programs = await database.patientProgram.findMany({ where: { id: { in: [...programIds] } }, select: programRoundSelect });
  return new Map(programs.map((program) => [program.id, projectRoundReports(buildProgramRoundFacts(program)).map((round) => {
    const vitals = buildRoundVitalsView(program, round.roundNumber, { recorderNames: false });
    return { ...round, vitals: vitals ? { weight: vitals.weight, bloodSugar: vitals.bloodSugar } : null };
  })]));
}
