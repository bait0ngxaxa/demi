import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { GUIDELINE_ROUND_COUNT, toProgramRoundNumber } from "@/modules/patient-program-rounds/domain/round-catalog";
import { openGuidelineRound } from "@/modules/patient-program-rounds/services/round-plan-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function programIdOf(input: unknown): string | null {
  const value = (input as { patientProgramId?: unknown } | null)?.patientProgramId;
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}

/**
 * ADR-0022: opens guideline rounds 1..`upToRound` (at most 6) with their plans through the production opener,
 * without completing any. Concurrent test writes may open the same round; the loser's unique violation is ignored.
 */
export async function openGuidelineRounds(
  patientProgramId: string,
  upToRound: number,
): Promise<{ patientHospitalRelationshipId: string; createdByUserId: string } | null> {
  const prisma = getPrisma();
  const program = await prisma.patientProgram.findUnique({
    where: { id: patientProgramId },
    select: { patientHospitalRelationshipId: true, createdByUserId: true, startedAt: true },
  });

  if (!program) {
    return null;
  }

  for (let round = 1; round <= Math.min(upToRound, GUIDELINE_ROUND_COUNT); round += 1) {
    try {
      await prisma.$transaction((transaction) =>
        openGuidelineRound(transaction, {
          patientProgramId,
          patientHospitalRelationshipId: program.patientHospitalRelationshipId,
          roundNumber: round,
          openedByUserId: program.createdByUserId,
          openedAt: program.startedAt,
        }),
      );
    } catch (error: unknown) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        throw error;
      }
    }
  }

  return program;
}

/**
 * Phase R1 (SR-D5): round n accepts writes only after round n-1 is completed. Tests of other domains
 * (Goal Plans, Follow-ups, reports) are not about that sequence, so they open the round they write to by
 * opening the guideline rounds up to it (ADR-0022, the production opener) and recording the earlier
 * completions directly. Sequencing itself is covered by patient-program-rounds.integration.test.ts
 * through the real completion service. A Program created without the Program service gets round 1 here.
 */
export async function openProgramRound(patientProgramId: string, roundNumber: number): Promise<void> {
  const program = await openGuidelineRounds(patientProgramId, roundNumber);

  if (!program || roundNumber <= 1) {
    return;
  }

  await getPrisma().patientProgramRoundCompletion.createMany({
    data: Array.from({ length: Math.min(roundNumber - 1, GUIDELINE_ROUND_COUNT) }, (_, index) => ({
      patientProgramId,
      patientHospitalRelationshipId: program.patientHospitalRelationshipId,
      roundNumber: index + 1,
      completedByUserId: program.createdByUserId,
      submissionNonce: randomUUID(),
    })),
    skipDuplicates: true,
  });
}

/** The Program's first Goal Plan is round 2; an adjusted plan belongs to its Follow-up's (already open) round. */
export async function openGoalPlanRound(input: unknown): Promise<void> {
  const programId = programIdOf(input);
  const sourceFollowupId = (input as { sourceFollowupId?: unknown } | null)?.sourceFollowupId;

  if (programId && !sourceFollowupId) {
    const completed = await getPrisma().patientProgramRoundCompletion.count({
      where: { patientProgramId: programId, roundNumber: 2 },
    });

    if (completed === 0) {
      await openProgramRound(programId, 2);
    }
  }
}

/** Follow-up k is round k + 2. */
export async function openFollowupRound(input: unknown): Promise<void> {
  const programId = programIdOf(input);

  if (programId) {
    const recorded = await getPrisma().patientFollowup.count({ where: { patientProgramId: programId } });
    await openProgramRound(programId, toProgramRoundNumber(recorded + 1));
  }
}

/** The After assessment follows round 6. */
export async function openFinalAssessmentRound(input: unknown): Promise<void> {
  const programId = programIdOf(input);

  if (programId) {
    await openProgramRound(programId, 7);
  }
}

/**
 * Completions, skips, opened rounds and their plan items are append-only outside the demo/test reset switch
 * (migrations 20261102100000 and 20261124100000). Cleanup only: a Program needs its rounds again afterwards.
 */
export async function clearProgramRoundCompletions(programIds?: readonly string[]): Promise<void> {
  const prisma = getPrisma();
  const where = programIds ? { patientProgramId: { in: [...programIds] } } : {};

  await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    prisma.patientProgramRoundStepSkip.deleteMany({ where }),
    prisma.patientProgramRoundCompletion.deleteMany({ where }),
    prisma.patientProgramRoundPlanItem.deleteMany({ where }),
    prisma.patientProgramRound.deleteMany({ where }),
  ]);
}

type ServiceCall<T> = (actor: ActorContext | null | undefined, input: unknown, dependencies?: object) => Promise<T>;

/** Places a Service 1 write in its round (adding `roundNumber` when the test omits it) and opens that round. */
export function inRound<T>(service: ServiceCall<T>, roundFor: (input: Record<string, unknown>) => number): ServiceCall<T> {
  return async (actor, input, dependencies) => {
    if (typeof input !== "object" || input === null || "roundNumber" in input) {
      return service(actor, input, dependencies);
    }

    const record = input as Record<string, unknown>;
    const roundNumber = roundFor(record);
    if (typeof record.patientProgramId === "string") {
      await openProgramRound(record.patientProgramId, roundNumber);
    }

    return service(actor, { ...record, roundNumber }, dependencies);
  };
}

/** Opens the round a Goal Plan, Follow-up or Final Assessment write belongs to, then calls the service. */
export function afterOpening<T>(service: ServiceCall<T>, open: (input: unknown) => Promise<void>): ServiceCall<T> {
  return async (actor, input, dependencies) => {
    await open(input);
    return service(actor, input, dependencies);
  };
}
