import { ConflictError } from "@/shared/errors/application-error";

export class ExerciseCreateConsumedError extends ConflictError {
  constructor() {
    super("The create request cannot be repeated");
    this.name = "ExerciseCreateConsumedError";
  }
}
