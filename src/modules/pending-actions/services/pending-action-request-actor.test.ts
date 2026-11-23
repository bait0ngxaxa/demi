import { AsyncLocalStorage } from "node:async_hooks";

import { UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

/**
 * Models the server render contract of React `cache()` as request-application-actor.test.ts does: memoized within one
 * render request, never across requests, and not at all outside a render request (Vitest loads the client React build).
 */
const renderRequest = new AsyncLocalStorage<Map<unknown, unknown>>();

function inRenderRequest<T>(render: () => Promise<T>): Promise<T> {
  return renderRequest.run(new Map(), render);
}

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findUnique: vi.fn(),
  services: vi.fn(),
  appointments: vi.fn(),
  acceptances: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T>(fn: () => T): (() => T) => () => {
      const requestCache = renderRequest.getStore();
      if (!requestCache) return fn();
      if (!requestCache.has(fn)) requestCache.set(fn, fn());
      return requestCache.get(fn) as T;
    },
  };
});
vi.mock("@/lib/auth/supabase-server", () => ({
  getServerSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => ({ user: { findUnique: mocks.findUnique }, patientServiceRequest: { count: mocks.services } }),
}));
vi.mock("@/modules/appointments/services/work-appointment-query-service", () => ({
  countWorkAppointmentRequestsByHospital: mocks.appointments,
  countWorkAppointmentAcceptanceByHospital: mocks.acceptances,
}));

import { getRequestApplicationActor } from "@/modules/auth/services/request-application-actor";
import { getPendingActions, loadPendingActions } from "./pending-action-service";

const hospitalStaff = {
  id: "user-1",
  personId: "person-1",
  status: UserStatus.ACTIVE,
  roles: [{ role: "HOSPITAL" }],
  memberships: [{
    hospitalId: "hospital-1",
    membershipType: "MEMBER",
    profession: null,
    status: "ACTIVE",
    reportExportGrantedAt: null,
    hospital: { status: "ACTIVE" },
  }],
  osmHospitalRelationships: [],
};

/** The protected layout resolves the actor, then its shell indicators. */
async function renderLayout(): Promise<void> {
  await getRequestApplicationActor();
  await getPendingActions();
}

/** /app: the layout plus the Work home page, which reads the actor and the indicators again. */
async function navigateToWorkHome(): Promise<void> {
  await Promise.all([renderLayout(), getRequestApplicationActor().then(() => getPendingActions())]);
}

/** /app/appointments: the layout plus the queue page, which reads the actor and the indicators for its pending scope. */
async function navigateToAppointments(): Promise<void> {
  await Promise.all([renderLayout(), (async () => {
    await getRequestApplicationActor();
    await getPendingActions();
  })()]);
}

describe("pending actions in a server render request", () => {
  beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "auth-subject-1" } }, error: null });
    mocks.findUnique.mockReset().mockResolvedValue(hospitalStaff);
    mocks.services.mockReset().mockResolvedValue(4);
    mocks.appointments.mockReset().mockResolvedValue([{ hospitalId: "hospital-1", count: 5, rescheduleCount: 5, cancellationCount: 0 }]);
    mocks.acceptances.mockReset().mockResolvedValue([]);
  });

  it.each([
    ["/app", navigateToWorkHome],
    ["/app/appointments", navigateToAppointments],
  ])("reads the actor once in total for %s, shared by the layout and the indicators", async (_route, navigate) => {
    await inRenderRequest(navigate);

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.services).toHaveBeenCalledTimes(1);
    expect(mocks.appointments).toHaveBeenCalledTimes(1);
  });

  it("counts for the request actor, with the same indicators as a fresh resolution", async () => {
    const now = new Date("2026-11-23T00:00:00Z");
    vi.useFakeTimers({ now, toFake: ["Date"] });
    try {
      const cached = await inRenderRequest(getPendingActions);
      const fresh = await loadPendingActions(hospitalStaff.id, undefined, now);

      expect(cached).toEqual(fresh);
      expect(cached).toMatchObject({ status: "READY", indicators: [{ count: 4 }, { count: 5 }] });
      expect(mocks.appointments).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), ["hospital-1"], expect.anything());
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the uncached user-ID path fresh: it re-reads the actor (the read this change removes from renders)", async () => {
    await inRenderRequest(async () => {
      const actor = await getRequestApplicationActor();
      await loadPendingActions(actor.userId);
    });

    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it("resolves again in every new request, so a suspension applies from the next request", async () => {
    await inRenderRequest(navigateToWorkHome);
    mocks.findUnique.mockResolvedValue({ ...hospitalStaff, status: UserStatus.SUSPENDED });

    await expect(inRenderRequest(getPendingActions)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it("propagates a missing session to protected-access handling instead of degrading it", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(inRenderRequest(getPendingActions)).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it("degrades an actor-store infrastructure failure to UNAVAILABLE, which grants nothing", async () => {
    mocks.findUnique.mockRejectedValue(new Error("pool exhausted"));

    const result = await inRenderRequest(getPendingActions);

    expect(result).toEqual({ status: "UNAVAILABLE", checkedAt: expect.any(Number) });
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it("degrades a count failure to UNAVAILABLE without a synthetic zero count", async () => {
    mocks.services.mockRejectedValue(new Error("connection reset"));

    expect(await inRenderRequest(getPendingActions)).toEqual({ status: "UNAVAILABLE", checkedAt: expect.any(Number) });
  });
});
