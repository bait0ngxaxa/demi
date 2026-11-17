/** The shared rate limiter's only failure: its PostgreSQL store is unavailable (fail closed). */
export type LineWorkflowFailureCode = "INFRASTRUCTURE_UNAVAILABLE";

/** Safe classification only; never carries provider bodies, tokens, or identities. */
export class LineWorkflowFailure extends Error {
  constructor(readonly code: LineWorkflowFailureCode) {
    super("LINE workflow could not be continued");
    this.name = "LineWorkflowFailure";
  }
}
