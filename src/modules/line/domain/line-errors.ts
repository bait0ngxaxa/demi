export type LineFailureCode =
  | "INVALID_LINE_IDENTITY"
  | "LINE_TOKEN_INVALID_OR_EXPIRED"
  | "LINK_INTENT_INVALID_EXPIRED_OR_REPLAYED"
  | "DEMI_ACCOUNT_INELIGIBLE"
  | "LINE_BINDING_CONFLICT"
  | "UNLINK_UNAUTHORIZED"
  | "FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE"
  | "LINE_PROVIDER_TRANSIENT"
  | "LINE_PROVIDER_PERMANENT"
  | "RICH_MENU_MISMATCH"
  | "LINE_CONFIGURATION_MISSING"
  | "LINE_RATE_LIMITED";

export class LineFailure extends Error {
  constructor(
    readonly code: LineFailureCode,
    message = "LINE account operation could not be completed",
  ) {
    super(message);
    this.name = "LineFailure";
  }
}
