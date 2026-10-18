export type LineWorkflowFailureCode =
  | "WORKFLOW_DISABLED"
  | "WORKFLOW_NOT_ACTIVATED"
  | "MINI_CONFIGURATION_UNAVAILABLE"
  | "LIFECYCLE_UNAVAILABLE"
  | "ORIGIN_DENIED"
  | "REQUEST_INVALID"
  | "RATE_LIMITED"
  | "LOGIN_REQUIRED"
  | "SESSION_UNAVAILABLE"
  | "LINE_IDENTITY_INVALID"
  | "LINE_WRONG_AUDIENCE"
  | "LINE_PROVIDER_UNAVAILABLE"
  | "LINE_PROVIDER_RESPONSE_INVALID"
  | "LINE_NOT_LINKED"
  | "BINDING_INCONSISTENT"
  | "ACCOUNT_MISMATCH"
  | "WORKFLOW_INELIGIBLE"
  | "SCOPE_MISSING"
  | "SCOPE_INVALID"
  | "SCOPE_EXPIRED"
  | "SCOPE_REVOKED"
  | "SCOPE_SESSION_MISMATCH"
  | "INFRASTRUCTURE_UNAVAILABLE";

/** Safe classification only; never carries provider bodies, tokens, or identities. */
export class LineWorkflowFailure extends Error {
  constructor(readonly code: LineWorkflowFailureCode) {
    super("LINE workflow could not be continued");
    this.name = "LineWorkflowFailure";
  }
}
