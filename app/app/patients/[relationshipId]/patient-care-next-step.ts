import type {
  ProgramRoundsOverview,
  RoundSummary,
} from "@/modules/patient-program-rounds/services/round-query-service";

export type PatientCareNextStepInput = {
  access: "DIRECT" | "NETWORK";
  baselineExists: boolean;
  canCreateBaseline: boolean;
  activeProgram: { programId: string; canManage: boolean } | null;
  canOpenProgram: boolean;
  roundsOverview: Pick<ProgramRoundsOverview, "rounds" | "after"> | null;
};

export type PatientCareNextStep =
  | { type: "NONE"; reason: "READ_ONLY" | "NO_ACTION" | "PROGRAM_NOT_MANAGEABLE" }
  | { type: "BASELINE" }
  | { type: "OPEN_PROGRAM" }
  | { type: "ROUND"; programId: string; roundNumber: RoundSummary["roundNumber"]; state: RoundSummary["state"] }
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

    if (overview.rounds.length !== 6) {
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
