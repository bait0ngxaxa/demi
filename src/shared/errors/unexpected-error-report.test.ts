import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { ConflictError, InfrastructureError } from "@/shared/errors/application-error";
import {
  reportUnexpectedError,
  toInfrastructureError,
  UNEXPECTED_ERROR_EVENT,
} from "@/shared/errors/unexpected-error-report";

const sensitiveMessage = "Failing row contains (สมชาย ใจดี, 1103700012345, 0812345678)";

function unknownRequestError(message: string): Prisma.PrismaClientUnknownRequestError {
  return new Prisma.PrismaClientUnknownRequestError(message, { clientVersion: "6.19.2" });
}

function loggedReport(): Record<string, unknown> {
  return (consoleError.mock.calls[0]?.[1] ?? {}) as Record<string, unknown>;
}

function prismaError(code: string, meta?: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(sensitiveMessage, { code, clientVersion: "6.19.2", meta });
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("reportUnexpectedError", () => {
  it("logs the scope, class name, Prisma code, SQLSTATE and stack frames under a fixed event", () => {
    reportUnexpectedError("patient-program-rounds.round-service", prismaError("P2010", { code: "23514", message: sensitiveMessage }));

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [event, report] = consoleError.mock.calls[0] ?? [];
    expect(event).toBe(UNEXPECTED_ERROR_EVENT);
    expect(report).toEqual({
      scope: "patient-program-rounds.round-service",
      errorClass: "PrismaClientKnownRequestError",
      prismaCode: "P2010",
      sqlState: "23514",
      constraint: null,
      stack: expect.any(Array),
    });
    expect((report as { stack: string[] }).stack.length).toBeGreaterThan(0);
    expect((report as { stack: string[] }).stack.every((frame) => frame.startsWith("at "))).toBe(true);
  });

  it("never logs the error message, meta values or row values", () => {
    reportUnexpectedError("scope", prismaError("P2002", { target: ["nationalIdHash"], modelName: sensitiveMessage }));
    reportUnexpectedError("scope", new TypeError(sensitiveMessage));

    const serialized = JSON.stringify(consoleError.mock.calls);
    expect(serialized).not.toContain("สมชาย");
    expect(serialized).not.toContain("1103700012345");
    expect(serialized).not.toContain("0812345678");
    expect(serialized).not.toContain("nationalIdHash");
    expect(serialized).not.toContain("Failing row");
  });

  it("logs nulls for errors without a Prisma code or SQLSTATE and for non-object throws", () => {
    reportUnexpectedError("scope", new RangeError("x"));
    reportUnexpectedError("scope", "a thrown string with 1103700012345");

    expect(consoleError.mock.calls[0]?.[1]).toMatchObject({ errorClass: "RangeError", prismaCode: null, sqlState: null });
    expect(consoleError.mock.calls[1]?.[1]).toEqual({
      scope: "scope",
      errorClass: "string",
      prismaCode: null,
      sqlState: null,
      constraint: null,
      stack: [],
    });
  });

  it("does not report an ApplicationError, including an InfrastructureError that already carries a cause", () => {
    reportUnexpectedError("scope", new ConflictError("conflict"));
    reportUnexpectedError("scope", new InfrastructureError("could not be saved", { cause: new Error("db") }));

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("reports the same error object only once when it passes through several layers", () => {
    const error = new Error("db");
    reportUnexpectedError("inner", error);
    reportUnexpectedError("outer", error);

    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

describe("reportUnexpectedError for Prisma unknown request errors", () => {
  const triggerMessage = "Ended patient hospital relationship cannot be reopened or changed";

  it("reads the SQLSTATE of a trigger RAISE from the engine message without logging the message", () => {
    reportUnexpectedError("scope", unknownRequestError(
      "Invalid `prisma.patientHospitalRelationship.updateMany()` invocation:\n\n\nError occurred during query execution:\n" +
        `ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23514", message: "${triggerMessage}", severity: "ERROR", detail: None, column: None, hint: None }), transient: false })`,
    ));

    expect(loggedReport()).toMatchObject({
      errorClass: "PrismaClientUnknownRequestError",
      prismaCode: null,
      sqlState: "23514",
      constraint: null,
    });
    const serialized = JSON.stringify(consoleError.mock.calls);
    expect(serialized).not.toContain(triggerMessage);
    expect(serialized).not.toContain("ConnectorError");
  });

  it("reads the constraint name of a CHECK violation and not the failing row", () => {
    reportUnexpectedError("scope", unknownRequestError(
      "Error occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { " +
        'code: "23514", message: "new row for relation \\"PatientAppointment\\" violates check constraint \\"PatientAppointment_assigned_osm_home_visit_check\\"", ' +
        'severity: "ERROR", detail: Some("Failing row contains (สมศรี มีสุข, 1103700012345, HOSPITAL)."), column: None, hint: None }), transient: false })',
    ));

    expect(loggedReport()).toMatchObject({ sqlState: "23514", constraint: "PatientAppointment_assigned_osm_home_visit_check" });
    const serialized = JSON.stringify(consoleError.mock.calls);
    expect(serialized).not.toContain("สมศรี");
    expect(serialized).not.toContain("1103700012345");
    expect(serialized).not.toContain("Failing row");
  });

  it("logs null SQLSTATE and constraint when the message carries neither", () => {
    reportUnexpectedError("scope", unknownRequestError("Engine returned an unexpected response for สมศรี"));

    expect(loggedReport()).toMatchObject({ sqlState: null, constraint: null });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("สมศรี");
  });

  it("reads the constraint from a known request error's meta only when it is an identifier", () => {
    reportUnexpectedError("scope", prismaError("P2002", { target: "PatientProfile_personId_key" }));
    reportUnexpectedError("scope", prismaError("P2002", { target: ["nationalIdHash"], constraint: "not an identifier; DROP" }));

    expect(consoleError.mock.calls[0]?.[1]).toMatchObject({ prismaCode: "P2002", constraint: "PatientProfile_personId_key" });
    expect(consoleError.mock.calls[1]?.[1]).toMatchObject({ prismaCode: "P2002", constraint: null });
  });

  it("does not read tokens from the message of an error that is not a Prisma request error", () => {
    reportUnexpectedError("scope", new Error('code: "23514" violates check constraint "Some_check"'));

    expect(loggedReport()).toMatchObject({ sqlState: null, constraint: null });
  });
});

describe("toInfrastructureError", () => {
  it("returns the caller's InfrastructureError with the original error as cause", () => {
    const original = prismaError("P2034");

    const converted = toInfrastructureError("scope", original, "Program round could not be saved");

    expect(converted).toBeInstanceOf(InfrastructureError);
    expect(converted.message).toBe("Program round could not be saved");
    expect(converted.cause).toBe(original);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("keeps the default message and does not report again when a converted error is converted a second time", () => {
    const inner = toInfrastructureError("inner", new Error("db"));
    const outer = toInfrastructureError("outer", inner, "Outer could not be loaded");

    expect(inner.message).toBe("A dependent service is unavailable");
    expect(outer.cause).toBe(inner);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.[1]).toMatchObject({ scope: "inner" });
  });
});
