import "server-only";

import { Prisma } from "@prisma/client";

import { ApplicationError, InfrastructureError } from "@/shared/errors/application-error";

export const UNEXPECTED_ERROR_EVENT = "demi.unexpected_error";

const MAX_STACK_FRAMES = 20;
const PRISMA_ERROR_CODE_PATTERN = /^P\d{4}$/;
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
/** Prisma 6 engine output for a database error: `PostgresError { code: "23514", message: "…", … }`. */
const MESSAGE_SQLSTATE_PATTERN = /code: "([0-9A-Z]{5})"/;
/**
 * PostgreSQL error text `violates check constraint "Name"`. Inside the engine message the PostgreSQL text is a
 * Rust debug string, so its quotes arrive escaped (`constraint \"Name\"`); both spellings are accepted.
 */
const MESSAGE_CONSTRAINT_PATTERN = /constraint \\?"([A-Za-z_][A-Za-z0-9_]{0,62})\\?"/;
const STACK_FRAME_PATTERN = /^\s*at\s/;

export type UnexpectedErrorReport = {
  scope: string;
  errorClass: string;
  prismaCode: string | null;
  sqlState: string | null;
  constraint: string | null;
  stack: string[];
};

const reportedErrors = new WeakSet<object>();

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readErrorClass(error: unknown): string {
  if (error === null) return "null";
  if (typeof error !== "object" && typeof error !== "function") return typeof error;

  const constructorName = (error as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof constructorName === "string" && constructorName.length > 0 ? constructorName : "Object";
}

function readPrismaCode(error: unknown): string | null {
  const code = readRecord(error)?.code;
  return typeof code === "string" && PRISMA_ERROR_CODE_PATTERN.test(code) ? code : null;
}

function readPrismaMeta(error: unknown): Record<string, unknown> | null {
  return readRecord(readRecord(error)?.meta);
}

/**
 * Only Prisma request errors are matched: their message is engine output, so the captured token is the database's
 * code or constraint name. The match runs in memory and only the captured token is returned, never the message.
 */
function readPrismaMessageToken(error: unknown, pattern: RegExp): string | null {
  if (!(error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }
  return pattern.exec(error.message)?.[1] ?? null;
}

/**
 * `meta.code` / `meta.sqlState` on a known request error (P2010); otherwise the engine message, which is the only
 * place Prisma 6 keeps the SQLSTATE of a trigger RAISE or CHECK violation from an ORM write (unknown request error).
 */
function readSqlState(error: unknown): string | null {
  const meta = readPrismaMeta(error);
  for (const candidate of [meta?.code, meta?.sqlState]) {
    if (typeof candidate === "string" && SQLSTATE_PATTERN.test(candidate)) return candidate;
  }

  return readPrismaMessageToken(error, MESSAGE_SQLSTATE_PATTERN);
}

function readConstraint(error: unknown): string | null {
  const meta = readPrismaMeta(error);
  for (const candidate of [meta?.constraint, meta?.target]) {
    if (typeof candidate === "string" && IDENTIFIER_PATTERN.test(candidate)) return candidate;
  }

  return readPrismaMessageToken(error, MESSAGE_CONSTRAINT_PATTERN);
}

/** Keeps only `at …` frames: the first stack line repeats the message, which may contain row values. */
function readStackFrames(error: unknown): string[] {
  const stack = readRecord(error)?.stack;
  if (typeof stack !== "string") return [];

  return stack
    .split("\n")
    .filter((line) => STACK_FRAME_PATTERN.test(line))
    .slice(0, MAX_STACK_FRAMES)
    .map((line) => line.trim());
}

export function buildUnexpectedErrorReport(scope: string, error: unknown): UnexpectedErrorReport {
  return {
    scope,
    errorClass: readErrorClass(error),
    prismaCode: readPrismaCode(error),
    sqlState: readSqlState(error),
    constraint: readConstraint(error),
    stack: readStackFrames(error),
  };
}

/**
 * Reports an unexpected (non-ApplicationError) error once to the server log.
 * Only the scope, class name, Prisma code, SQLSTATE, constraint name and stack frames are logged:
 * never the message, query, parameters, request input or personal identifiers.
 */
export function reportUnexpectedError(scope: string, error: unknown): void {
  if (error instanceof ApplicationError) return;

  if (typeof error === "object" && error !== null) {
    if (reportedErrors.has(error)) return;
    reportedErrors.add(error);
  }

  try {
    console.error(UNEXPECTED_ERROR_EVENT, buildUnexpectedErrorReport(scope, error));
  } catch {
    // Logging must never change the outcome of the failed operation.
  }
}

/**
 * Converts a caught error into the safe InfrastructureError the caller already exposes,
 * keeping the original error as `cause` and reporting it once when it is unexpected.
 */
export function toInfrastructureError(scope: string, error: unknown, message?: string): InfrastructureError {
  reportUnexpectedError(scope, error);
  return new InfrastructureError(message, { cause: error });
}

