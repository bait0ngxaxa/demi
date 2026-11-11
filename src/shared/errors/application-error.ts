export type ApplicationErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INFRASTRUCTURE";

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;

  constructor(code: ApplicationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApplicationError";
    this.code = code;
  }
}

export class UnauthenticatedError extends ApplicationError {
  constructor(message = "Authentication is required") {
    super("UNAUTHENTICATED", message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message = "The requested operation is not allowed") {
    super("FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends ApplicationError {
  constructor(message = "The submitted data is invalid") {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends ApplicationError {
  constructor(message = "The requested state conflicts with existing data") {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message = "The requested resource was not found") {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export type InfrastructureErrorOptions = {
  /** The original unexpected error; kept on the server only and never part of a client response. */
  cause?: unknown;
};

export class InfrastructureError extends ApplicationError {
  constructor(message = "A dependent service is unavailable", options?: InfrastructureErrorOptions) {
    super("INFRASTRUCTURE", message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "InfrastructureError";
  }
}
