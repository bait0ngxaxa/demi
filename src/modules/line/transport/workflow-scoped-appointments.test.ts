import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import { LineWorkflowFailure, type LineWorkflowFailureCode } from "../domain/line-workflow-errors";

const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  run: vi.fn(),
  list: vi.fn(),
  history: vi.fn(),
  detail: vi.fn(),
  reschedule: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("../services/line-workflow-service", () => ({ runLineWorkflowScopedRead: mocks.run }));
vi.mock("@/modules/appointments/services/appointment-reschedule-history-service", () => ({ getAppointmentRescheduleHistory: mocks.reschedule }));
vi.mock("@/modules/patient-self/services/patient-self-query-service", () => ({ listOwnPatientRelationshipNavigation: mocks.list }));
vi.mock("@/modules/patient-self/services/patient-self-care-query-service", () => ({
  getOwnPatientAppointmentHistory: mocks.history,
  getOwnPatientAppointmentDetail: mocks.detail,
}));

import {
  lineWorkflowScopedFailureState,
  loadLineWorkflowAppointmentDetail,
  loadLineWorkflowAppointmentHistory,
  loadLineWorkflowAppointmentRelationships,
} from "./workflow-scoped-appointments";

const snapshot = { actor: { userId: "u" }, database: { tx: true } };

describe("scoped Appointment loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookie.mockReturnValue({ value: "v1.k1.context" });
    mocks.run.mockImplementation(async (_credential: unknown, read: (value: typeof snapshot) => Promise<unknown>) => read(snapshot));
  });

  it("always hands the workflow cookie to the mandatory guard and queries on its snapshot client", async () => {
    mocks.list.mockResolvedValue(["r"]);
    mocks.history.mockResolvedValue({ appointments: [] });
    mocks.detail.mockResolvedValue({ appointmentId: "a" });
    await expect(loadLineWorkflowAppointmentRelationships()).resolves.toEqual({ status: "AUTHORIZED", data: ["r"] });
    await loadLineWorkflowAppointmentHistory("rel", "2");
    mocks.reschedule.mockResolvedValue({ requests: [{ id: "q" }], canRequest: true, canReview: true, updatedAt: new Date(), scheduled: true });
    // Reschedule history shares the guarded snapshot; request/review capability flags never leave the loader.
    await expect(loadLineWorkflowAppointmentDetail("rel", "appt")).resolves.toEqual({
      status: "AUTHORIZED", data: { detail: { appointmentId: "a" }, rescheduleRequests: [{ id: "q" }] },
    });
    expect(mocks.reschedule).toHaveBeenCalledWith(snapshot.actor, "rel", "appt", { database: snapshot.database });
    expect(mocks.cookie).toHaveBeenCalledWith("__Secure-DEMI_LINE_WORKFLOW");
    expect(mocks.run.mock.calls.every(([credential]) => credential === "v1.k1.context")).toBe(true);
    expect(mocks.list).toHaveBeenCalledWith(snapshot.actor, { database: snapshot.database });
    expect(mocks.history).toHaveBeenCalledWith(snapshot.actor, "rel", { database: snapshot.database }, "2");
    expect(mocks.detail).toHaveBeenCalledWith(snapshot.actor, "rel", "appt", { database: snapshot.database });
  });

  it("passes an absent cookie to the guard instead of choosing ordinary authority", async () => {
    mocks.cookie.mockReturnValue(undefined);
    mocks.run.mockRejectedValue(new LineWorkflowFailure("SCOPE_MISSING"));
    await expect(loadLineWorkflowAppointmentRelationships()).resolves.toEqual({ status: "DENIED", state: "SCOPE_MISSING" });
    expect(mocks.run.mock.calls[0][0]).toBeUndefined();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns a denial state rather than data, empty data or a redirect", async () => {
    mocks.run.mockRejectedValue(new NotFoundError());
    await expect(loadLineWorkflowAppointmentDetail("rel", "foreign")).resolves.toEqual({ status: "DENIED", state: "RESOURCE_INVALID" });
  });

  it("rethrows framework control flow", async () => {
    const dynamicUsage = Object.assign(new Error("dynamic"), { digest: "DYNAMIC_SERVER_USAGE" });
    mocks.run.mockRejectedValue(dynamicUsage);
    await expect(loadLineWorkflowAppointmentRelationships()).rejects.toBe(dynamicUsage);
  });
});

describe("scoped failure classification", () => {
  it.each<[LineWorkflowFailureCode, string]>([
    ["MINI_CONFIGURATION_UNAVAILABLE", "TEMPORARILY_UNAVAILABLE"],
    ["LIFECYCLE_UNAVAILABLE", "TEMPORARILY_UNAVAILABLE"],
    ["SCOPE_MISSING", "SCOPE_MISSING"],
    ["SCOPE_INVALID", "SCOPE_MISSING"],
    ["SCOPE_EXPIRED", "SCOPE_EXPIRED"],
    ["SCOPE_REVOKED", "SCOPE_REVOKED"],
    ["SCOPE_SESSION_MISMATCH", "SESSION_MISMATCH"],
    ["LOGIN_REQUIRED", "LOGIN_REQUIRED"],
    ["SESSION_UNAVAILABLE", "AUTH_UNAVAILABLE"],
    ["RATE_LIMITED", "RATE_LIMITED"],
    ["WORKFLOW_INELIGIBLE", "INELIGIBLE"],
    ["INFRASTRUCTURE_UNAVAILABLE", "TEMPORARILY_UNAVAILABLE"],
  ])("maps %s to %s", (code, state) => {
    expect(lineWorkflowScopedFailureState(new LineWorkflowFailure(code))).toBe(state);
  });

  it("maps domain denials and unknown failures without detail", () => {
    expect(lineWorkflowScopedFailureState(new ForbiddenError())).toBe("INELIGIBLE");
    expect(lineWorkflowScopedFailureState(new NotFoundError())).toBe("RESOURCE_INVALID");
    expect(lineWorkflowScopedFailureState(new InfrastructureError())).toBe("TEMPORARILY_UNAVAILABLE");
    expect(lineWorkflowScopedFailureState(new Error("raw provider body"))).toBe("TEMPORARILY_UNAVAILABLE");
  });
});
