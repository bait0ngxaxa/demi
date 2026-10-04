import type { PersonalWeightGoalDto, PersonalWeightGoalMutationResult } from "../domain/personal-weight-goal";

export type PersonalWeightGoalActionState = {
  status: "IDLE" | "SUCCESS" | "ERROR" | "CONFLICT" | "CREATE_CONSUMED" | "DENIED" | "UNCONFIRMED";
  message?: string;
  currentGoal?: PersonalWeightGoalDto | null;
  result?: PersonalWeightGoalMutationResult;
  fieldErrors?: Partial<Record<"targetWeightKg" | "targetDate", string>>;
};
