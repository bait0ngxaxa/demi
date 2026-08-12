export type ApplicationErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INFRASTRUCTURE";

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;

  constructor(code: ApplicationErrorCode, message: string) {
    super(message);
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

export class InfrastructureError extends ApplicationError {
  constructor(message = "A dependent service is unavailable") {
    super("INFRASTRUCTURE", message);
    this.name = "InfrastructureError";
  }
}
