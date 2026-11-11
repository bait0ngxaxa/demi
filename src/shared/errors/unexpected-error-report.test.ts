import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { ConflictError, InfrastructureError } from "@/shared/errors/application-error";
import {
  reportUnexpectedError,
  toInfrastructureError,
  UNEXPECTED_ERROR_EVENT,
} from "@/shared/errors/unexpected-error-report";

const sensitiveMessage = "Failing row contains (สมชาย ใจดี, 1103700012345, 0812345678)";

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
