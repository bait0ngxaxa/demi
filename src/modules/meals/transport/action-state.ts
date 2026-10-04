import type { PersonalMealPage } from "../domain/personal-meal";
import type { MealMutationResult } from "../services/personal-meal-service";

export type MealActionState = {
  status: "IDLE" | "SUCCESS" | "ERROR" | "CONFLICT" | "CREATE_CONSUMED" | "DENIED" | "UNCONFIRMED";
  message?: string; result?: MealMutationResult; page?: PersonalMealPage;
  fieldErrors?: Partial<Record<"category" | "occurredOn" | "description", string>>;
};
