import { ConflictError } from "@/shared/errors/application-error";

export class MealCreateConsumedError extends ConflictError {
  constructor() {
    super("The create request cannot be repeated");
    this.name = "MealCreateConsumedError";
  }
}
