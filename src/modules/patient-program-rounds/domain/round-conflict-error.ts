import { ConflictError } from "@/shared/errors/application-error";

/** A refused round write (SR-D3/D4/D5 sequencing, skips, completion); the Thai message is shown to the user as-is. */
export class RoundConflictError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = "RoundConflictError";
  }
}

export function roundConflictMessage(error: unknown): string | null {
  return error instanceof RoundConflictError ? error.message : null;
}
