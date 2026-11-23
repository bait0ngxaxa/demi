import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), onboarding: vi.fn(), support: vi.fn(), services: vi.fn(), appointments: vi.fn(), acceptances: vi.fn() }));
vi.mock("@/modules/auth/services/actor-context-service", () => ({ createActorContextStore: vi.fn(), resolveActorAccessByUserId: mocks.actor }));
vi.mock("@/modules/appointments/services/work-appointment-query-service", () => ({
  countWorkAppointmentRequestsByHospital: mocks.appointments, countWorkAppointmentAcceptanceByHospital: mocks.acceptances,
}));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({
  hospitalOnboardingApplication: { count: mocks.onboarding }, supportReport: { count: mocks.support },
  patientServiceRequest: { count: mocks.services },
}) }));
import { calculatePendingActions, calculatePendingActionsForActor, loadPendingActions } from "./pending-action-service";

const actor: ActorContext = { userId: "user", personId: "person", roles: ["PATIENT"], hospitalMemberships: [], osmHospitalRelationships: [] };
let authorizedActor: ActorContext = actor;
function authorize(overrides: Partial<ActorContext>): void {
  authorizedActor = { ...actor, ...overrides };
  mocks.actor.mockResolvedValue({ status: "AUTHORIZED", actor: authorizedActor });
}
beforeEach(() => {
  vi.clearAllMocks();
  authorize({});
  mocks.onboarding.mockResolvedValue(2);
  mocks.support.mockResolvedValue(3);
  mocks.services.mockResolvedValue(4);
  mocks.appointments.mockImplementation(async (_actor: unknown, hospitalIds: string[]) => hospitalIds.map((hospitalId) => ({ hospitalId, count: 5 })));
  mocks.acceptances.mockResolvedValue([]);
});

// The user-ID entry point resolves the actor itself; the actor entry point counts for an actor the caller resolved.
// Both must produce identical counts, so every source test runs against each.
const entryPoints = [
  ["calculatePendingActions", () => calculatePendingActions(actor.userId)],
  ["calculatePendingActionsForActor", () => calculatePendingActionsForActor(authorizedActor)],
] as const;

describe.each(entryPoints)("pending action sources via %s", (_entryPoint, calculate) => {
  it("counts only ADMIN queues even with a Hospital role", async () => {
    authorize({ roles: ["ADMIN", "HOSPITAL"] });
    expect((await calculate()).map(({ count }) => count)).toEqual([2, 3]);
    expect(mocks.onboarding).toHaveBeenCalledWith({ where: { status: "PENDING" } });
    expect(mocks.support).toHaveBeenCalledWith({ where: { status: "NEW" } });
    expect(mocks.services).not.toHaveBeenCalled();
    expect(mocks.appointments).not.toHaveBeenCalled();
    expect(mocks.acceptances).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "MEMBER"] as const)("respects active %s review authority and deduplicates Hospitals", async (membershipType) => {
    const membership = { hospitalId: "hospital", membershipType, profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" } as const;
    authorize({ roles: ["HOSPITAL"], hospitalMemberships: [membership, membership, { ...membership, hospitalId: "suspended", hospitalStatus: "SUSPENDED" }] });
    const indicators = await calculate();
    expect(indicators.map(({ count }) => count)).toEqual([4, 5]);
    expect(mocks.appointments).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ userId: "user" }), ["hospital"], expect.anything());
    expect(mocks.services).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      status: "PENDING", hospitalId: { in: ["hospital"] }, relationship: { is: expect.objectContaining({ endedAt: null }) },
    }) }));
    expect(indicators[1]?.href).toContain("hospitalId=hospital");
  });

  it("counts every authorized Hospital in one grouped call and opens the first with pending work", async () => {
    const membership = (hospitalId: string, membershipType: "OWNER" | "MEMBER") => ({ hospitalId, membershipType, profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" }) as const;
    authorize({ roles: ["HOSPITAL"], hospitalMemberships: [membership("a", "OWNER"), membership("b", "MEMBER"), membership("c", "MEMBER")] });
    mocks.appointments.mockResolvedValue([{ hospitalId: "a", count: 0 }, { hospitalId: "b", count: 4 }, { hospitalId: "c", count: 2 }]);
    const indicators = await calculate();
    expect(mocks.appointments).toHaveBeenCalledOnce();
    expect(indicators[1]).toMatchObject({ count: 6, href: "/app/appointments?tab=PENDING_REQUESTS&hospitalId=b", label: "คำขอนัดหมายรอพิจารณา" });
    expect(indicators[1]?.hospitalQueue).toEqual({ tab: "PENDING_REQUESTS", hospitals: [{ hospitalId: "a", count: 0 }, { hospitalId: "b", count: 4 }, { hospitalId: "c", count: 2 }] });
  });

  describe("typed appointment-request breakdown (APPT-REQ-TYPE)", () => {
    const membership = (hospitalId: string) => ({ hospitalId, membershipType: "MEMBER", profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" }) as const;
    const row = (hospitalId: string, count: number, rescheduleCount: number, cancellationCount: number) => ({ hospitalId, count, rescheduleCount, cancellationCount });
    async function appointmentIndicator() {
      return (await calculate()).find(({ navigationHref }) => navigationHref === "/app/appointments");
    }

    it("splits both kinds across Hospitals, links each to its first Hospital and keeps the distinct total", async () => {
      authorize({ roles: ["HOSPITAL"], hospitalMemberships: [membership("a"), membership("b"), membership("c")] });
      // Hospital b has one appointment carrying both kinds: it counts once in `count` and once per kind.
      mocks.appointments.mockResolvedValue([row("a", 1, 1, 0), row("b", 3, 2, 2), row("c", 2, 0, 2)]);
      const indicator = await appointmentIndicator();
      expect(indicator).toMatchObject({ count: 6, label: "คำขอนัดหมายรอพิจารณา", href: "/app/appointments?tab=PENDING_REQUESTS&hospitalId=a" });
      expect(indicator?.hospitalQueue?.hospitals).toEqual([{ hospitalId: "a", count: 1 }, { hospitalId: "b", count: 3 }, { hospitalId: "c", count: 2 }]);
      expect(indicator?.breakdown).toEqual([
        { kind: "RESCHEDULE", label: "คำขอเลื่อนนัดรอพิจารณา", count: 3,
          href: "/app/appointments?tab=PENDING_REQUESTS&requestType=RESCHEDULE&hospitalId=a",
          hospitals: [{ hospitalId: "a", count: 1 }, { hospitalId: "b", count: 2 }, { hospitalId: "c", count: 0 }] },
        { kind: "CANCELLATION", label: "คำขอยกเลิกนัดรอพิจารณา", count: 4,
          href: "/app/appointments?tab=PENDING_REQUESTS&requestType=CANCELLATION&hospitalId=b",
          hospitals: [{ hospitalId: "a", count: 0 }, { hospitalId: "b", count: 2 }, { hospitalId: "c", count: 2 }] },
      ]);
    });

    it("omits a kind with no pending request, and every kind when nothing is pending", async () => {
      authorize({ roles: ["HOSPITAL"], hospitalMemberships: [membership("a")] });
      mocks.appointments.mockResolvedValue([row("a", 2, 0, 2)]);
      expect((await appointmentIndicator())?.breakdown?.map(({ kind }) => kind)).toEqual(["CANCELLATION"]);
      mocks.appointments.mockResolvedValue([row("a", 0, 0, 0)]);
      expect(await appointmentIndicator()).toMatchObject({ count: 0, breakdown: [] });
    });

    it("never adds a breakdown to the OSM acceptance indicator", async () => {
      authorize({ roles: ["OSM"] });
      mocks.acceptances.mockResolvedValue([{ hospitalId: "mine", count: 3 }]);
      expect(await appointmentIndicator()).not.toHaveProperty("breakdown");
    });
  });

  it("sends OSM to their acceptance queue, including a Hospital that has pending work", async () => {
    authorize({ roles: ["OSM"] });
    mocks.acceptances.mockResolvedValue([{ hospitalId: "other", count: 0 }, { hospitalId: "mine", count: 10000 }]);
    expect(await calculate()).toEqual([expect.objectContaining({
      count: 10000, navigationHref: "/app/appointments", href: "/app/appointments?tab=AWAITING_MY_ACCEPTANCE&hospitalId=mine",
      label: "นัดหมายรอคุณตอบรับ", hospitalQueue: { tab: "AWAITING_MY_ACCEPTANCE", hospitals: [{ hospitalId: "other", count: 0 }, { hospitalId: "mine", count: 10000 }] },
    })]);
    expect(mocks.services).not.toHaveBeenCalled();
    expect(mocks.appointments).not.toHaveBeenCalled();
  });

  it("does not expand to personal roles or revoked Hospital memberships", async () => {
    expect(await calculate()).toEqual([]);
    authorize({ roles: ["HOSPITAL"], hospitalMemberships: [] });
    expect(await calculate()).toEqual([]);
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it("reports infrastructure failure explicitly", async () => {
    authorize({ roles: ["ADMIN"] });
    mocks.support.mockRejectedValue(new Error("database offline"));
    await expect(calculate()).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
  });
});

describe("pending action actor resolution", () => {
  it("propagates authorization failures rather than returning an empty queue", async () => {
    mocks.actor.mockResolvedValue({ status: "ACCOUNT_NOT_ACTIVE", accountStatus: "SUSPENDED" });
    await expect(calculatePendingActions(actor.userId)).rejects.toBeInstanceOf(ForbiddenError);
    mocks.actor.mockRejectedValue(new ForbiddenError());
    await expect(calculatePendingActions(actor.userId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not re-read the actor when the caller already resolved it", async () => {
    authorize({ roles: ["ADMIN"] });
    await calculatePendingActionsForActor(authorizedActor);
    expect(mocks.actor).not.toHaveBeenCalled();
  });
});

describe("indicator fault isolation", () => {
  const now = new Date("2026-11-14T00:00:00Z");

  it("keeps successful loading unchanged and stamps the evaluation", async () => {
    authorize({ roles: ["ADMIN"] });
    expect(await loadPendingActions(actor.userId, undefined, now)).toEqual({
      status: "READY", checkedAt: now.getTime(), indicators: await calculatePendingActions(actor.userId, undefined, now),
    });
  });

  it("degrades an indicator database failure to UNAVAILABLE without a synthetic zero count", async () => {
    authorize({ roles: ["HOSPITAL"], hospitalMemberships: [{ hospitalId: "hospital", membershipType: "MEMBER", profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" }] });
    mocks.services.mockRejectedValue(new Error("connection reset"));
    const result = await loadPendingActions(actor.userId, undefined, now);
    expect(result).toEqual({ status: "UNAVAILABLE", checkedAt: now.getTime() });
    expect(result).not.toHaveProperty("indicators");
  });

  it("degrades an actor-store infrastructure failure, which grants nothing", async () => {
    mocks.actor.mockRejectedValue(new Error("pool exhausted"));
    expect(await loadPendingActions(actor.userId, undefined, now)).toEqual({ status: "UNAVAILABLE", checkedAt: now.getTime() });
  });

  it.each([
    ["a suspended account", () => mocks.actor.mockResolvedValue({ status: "ACCOUNT_NOT_ACTIVE", accountStatus: "SUSPENDED" })],
    ["a revoked actor", () => mocks.actor.mockRejectedValue(new ForbiddenError())],
    ["a missing session", () => mocks.actor.mockRejectedValue(new UnauthenticatedError())],
  ])("keeps %s fail-closed instead of degrading it", async (_label, arrange) => {
    arrange();
    await expect(loadPendingActions(actor.userId, undefined, now)).rejects.toMatchObject({ code: expect.stringMatching(/^(FORBIDDEN|UNAUTHENTICATED)$/) });
  });

  it("calculates each user independently, so no count crosses users", async () => {
    mocks.actor.mockImplementation(async (userId: string) => ({ status: "AUTHORIZED", actor: { ...actor, userId, roles: userId === "admin" ? ["ADMIN"] : ["PATIENT"] } }));
    expect(await loadPendingActions("admin", undefined, now)).toMatchObject({ status: "READY", indicators: [{ count: 2 }, { count: 3 }] });
    expect(await loadPendingActions("patient", undefined, now)).toEqual({ status: "READY", checkedAt: now.getTime(), indicators: [] });
  });
});
