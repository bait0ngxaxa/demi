import type { PersonalExercisePage } from "../domain/personal-exercise";
import type { ExerciseMutationResult } from "../services/personal-exercise-service";

export type ExerciseActionState = {
  status: "IDLE" | "SUCCESS" | "ERROR" | "CONFLICT" | "CREATE_CONSUMED" | "DENIED" | "UNCONFIRMED";
  message?: string; result?: ExerciseMutationResult; page?: PersonalExercisePage;
  fieldErrors?: Partial<Record<"activityName" | "occurredOn" | "durationMinutes" | "note", string>>;
};
