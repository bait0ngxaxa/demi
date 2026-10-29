import { GUIDELINE_ROUND_COUNT } from "@/modules/patient-program-rounds/domain/round-catalog";
import type { RoundState } from "@/modules/patient-program-rounds/domain/round-steps";

/** The part of a Program's rounds overview the next step reads (structurally a `ProgramRoundsOverview`). */
export type CareNextStepRoundsOverview = {
  rounds: readonly { roundNumber: number; state: RoundState }[];
  after: { state: "LOCKED" | "RECORDED" | "NOT_RECORDED" };
};

export type PatientCareNextStepInput = {
  access: "DIRECT" | "NETWORK";
  baselineExists: boolean;
  canCreateBaseline: boolean;
  activeProgram: { programId: string; canManage: boolean } | null;
  canOpenProgram: boolean;
  roundsOverview: CareNextStepRoundsOverview | null;
};

export type PatientCareNextStep =
  | { type: "NONE"; reason: "READ_ONLY" | "NO_ACTION" | "PROGRAM_NOT_MANAGEABLE" }
  | { type: "BASELINE" }
  | { type: "OPEN_PROGRAM" }
  | { type: "ROUND"; programId: string; roundNumber: number; state: RoundState }
  | { type: "AFTER"; programId: string }
  | { type: "PROGRAM"; programId: string }
  | { type: "ROUNDS_OVERVIEW"; programId: string };

export function resolvePatientCareNextStep(
  input: PatientCareNextStepInput,
): PatientCareNextStep {
  const hasWritePermission =
    input.canCreateBaseline ||
    input.canOpenProgram ||
    input.activeProgram?.canManage === true;

  if (input.access === "NETWORK" || !hasWritePermission) {
    return { type: "NONE", reason: "READ_ONLY" };
  }

  if (input.activeProgram) {
    if (!input.activeProgram.canManage) {
      return { type: "NONE", reason: "PROGRAM_NOT_MANAGEABLE" };
    }

    const overview = input.roundsOverview;
    if (!overview) {
      return { type: "ROUNDS_OVERVIEW", programId: input.activeProgram.programId };
    }

    const firstIncompleteRound = [...overview.rounds]
      .sort((left, right) => left.roundNumber - right.roundNumber)
      .find((round) => round.state !== "COMPLETED");

    if (firstIncompleteRound) {
      return {
        type: "ROUND",
        programId: input.activeProgram.programId,
        roundNumber: firstIncompleteRound.roundNumber,
        state: firstIncompleteRound.state,
      };
    }

    // ADR-0022 Final Assessment gate: at least six opened rounds, all completed. Every listed round is
    // completed here and a completion needs an opened round, so the listed rounds are the opened ones.
    if (overview.rounds.length < GUIDELINE_ROUND_COUNT) {
      return { type: "ROUNDS_OVERVIEW", programId: input.activeProgram.programId };
    }

    if (overview.after.state === "NOT_RECORDED") {
      return { type: "AFTER", programId: input.activeProgram.programId };
    }

    if (overview.after.state === "RECORDED") {
      return { type: "PROGRAM", programId: input.activeProgram.programId };
    }

    return { type: "ROUNDS_OVERVIEW", programId: input.activeProgram.programId };
  }

  if (!input.baselineExists && input.canCreateBaseline) {
    return { type: "BASELINE" };
  }

  if (input.canOpenProgram) {
    return { type: "OPEN_PROGRAM" };
  }

  return { type: "NONE", reason: "NO_ACTION" };
}
