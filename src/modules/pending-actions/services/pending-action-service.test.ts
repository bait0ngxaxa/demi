import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), onboarding: vi.fn(), support: vi.fn(), services: vi.fn(), appointments: vi.fn(), acceptances: vi.fn() }));
vi.mock("@/modules/auth/services/actor-context-service", () => ({ createActorContextStore: vi.fn(), resolveActorAccessByUserId: mocks.actor }));
vi.mock("@/modules/appointments/services/work-appointment-query-service", () => ({
  countWorkAppointmentRequests: mocks.appointments, countWorkAppointmentAcceptanceByHospital: mocks.acceptances,
}));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({
  hospitalOnboardingApplication: { count: mocks.onboarding }, supportReport: { count: mocks.support },
  patientServiceRequest: { count: mocks.services },
}) }));
import { calculatePendingActions } from "./pending-action-service";

const actor: ActorContext = { userId: "user", personId: "person", roles: ["PATIENT"], hospitalMemberships: [], osmHospitalRelationships: [] };
function authorize(overrides: Partial<ActorContext>): void {
  mocks.actor.mockResolvedValue({ status: "AUTHORIZED", actor: { ...actor, ...overrides } });
}
beforeEach(() => {
  vi.clearAllMocks();
  authorize({});
  mocks.onboarding.mockResolvedValue(2);
  mocks.support.mockResolvedValue(3);
  mocks.services.mockResolvedValue(4);
  mocks.appointments.mockResolvedValue(5);
  mocks.acceptances.mockResolvedValue([]);
});

describe("pending action sources", () => {
  it("counts only ADMIN queues even with a Hospital role", async () => {
    authorize({ roles: ["ADMIN", "HOSPITAL"] });
    expect((await calculatePendingActions(actor.userId)).map(({ count }) => count)).toEqual([2, 3]);
    expect(mocks.onboarding).toHaveBeenCalledWith({ where: { status: "PENDING" } });
    expect(mocks.support).toHaveBeenCalledWith({ where: { status: "NEW" } });
    expect(mocks.services).not.toHaveBeenCalled();
    expect(mocks.appointments).not.toHaveBeenCalled();
    expect(mocks.acceptances).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "MEMBER"] as const)("respects active %s review authority and deduplicates Hospitals", async (membershipType) => {
    const membership = { hospitalId: "hospital", membershipType, profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" } as const;
    authorize({ roles: ["HOSPITAL"], hospitalMemberships: [membership, membership, { ...membership, hospitalId: "suspended", hospitalStatus: "SUSPENDED" }] });
    const indicators = await calculatePendingActions(actor.userId);
    expect(indicators.map(({ count }) => count)).toEqual([4, 5]);
    expect(mocks.appointments).toHaveBeenCalledTimes(1);
    expect(mocks.services).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      status: "PENDING", hospitalId: { in: ["hospital"] }, relationship: { is: expect.objectContaining({ endedAt: null }) },
    }) }));
    expect(indicators[1]?.href).toContain("hospitalId=hospital");
  });

  it("sends OSM to their acceptance queue, including a Hospital that has pending work", async () => {
    authorize({ roles: ["OSM"] });
    mocks.acceptances.mockResolvedValue([{ hospitalId: "other", count: 0 }, { hospitalId: "mine", count: 10000 }]);
    expect(await calculatePendingActions(actor.userId)).toEqual([expect.objectContaining({
      count: 10000, navigationHref: "/app/appointments", href: "/app/appointments?tab=AWAITING_MY_ACCEPTANCE&hospitalId=mine",
    })]);
    expect(mocks.services).not.toHaveBeenCalled();
    expect(mocks.appointments).not.toHaveBeenCalled();
  });

  it("does not expand to personal roles or revoked Hospital memberships", async () => {
    expect(await calculatePendingActions(actor.userId)).toEqual([]);
    authorize({ roles: ["HOSPITAL"], hospitalMemberships: [] });
    expect(await calculatePendingActions(actor.userId)).toEqual([]);
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it("propagates authorization failures rather than returning an empty queue", async () => {
    mocks.actor.mockResolvedValue({ status: "ACCOUNT_NOT_ACTIVE", accountStatus: "SUSPENDED" });
    await expect(calculatePendingActions(actor.userId)).rejects.toBeInstanceOf(ForbiddenError);
    mocks.actor.mockRejectedValue(new ForbiddenError());
    await expect(calculatePendingActions(actor.userId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("reports infrastructure failure explicitly", async () => {
    authorize({ roles: ["ADMIN"] });
    mocks.support.mockRejectedValue(new Error("database offline"));
    await expect(calculatePendingActions(actor.userId)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
  });
});
