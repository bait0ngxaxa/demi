import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getActor: vi.fn(),
  list: vi.fn(),
  redirect: vi.fn((href: string): never => { throw new Error(`REDIRECT:${href}`); }),
  notFound: vi.fn(),
  pendingActions: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: () => mocks.getActor(),
}));
vi.mock("@/modules/appointments/services/work-appointment-query-service", () => ({
  listWorkAppointments: mocks.list,
}));
vi.mock("./work-appointment-view", () => ({ WorkAppointmentView: () => null }));
vi.mock("@/modules/pending-actions/services/pending-action-service", () => ({ getPendingActions: mocks.pendingActions }));

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import WorkAppointmentPage from "./page";

const hospitalId = "33333333-3333-4333-8333-333333333333";
const owner: ActorContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{ hospitalId, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
  osmHospitalRelationships: [],
};

describe("work appointment page query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getActor.mockResolvedValue(owner);
    mocks.list.mockResolvedValue({});
    mocks.pendingActions.mockResolvedValue({ status: "READY", checkedAt: 0, indicators: [] });
  });

  it.each([
    ["unassigned", { unassigned: "true" }],
    ["unassignedOsm", { unassignedOsm: "true" }],
  ] as const)("passes the %s filter from the URL to the list query", async (_name, filter) => {
    await WorkAppointmentPage({ searchParams: Promise.resolve({ hospitalId, tab: "UPCOMING", ...filter }) });

    expect(mocks.list).toHaveBeenCalledExactlyOnceWith(owner, { hospitalId, tab: "UPCOMING", ...filter });
  });

  describe("multi-Hospital pending scope", () => {
    const other = "44444444-4444-4444-8444-444444444444";
    const unauthorized = "55555555-5555-4555-8555-555555555555";
    const page = { tab: "PENDING_REQUESTS", hospital: { hospitalId, hospitalName: "รพ. ก" }, hospitals: [
      { hospitalId, hospitalName: "รพ. ก" }, { hospitalId: other, hospitalName: "รพ. ข" },
    ] };
    const indicator = (tab: string) => ({ navigationHref: "/app/appointments", href: "/app/appointments", count: 9, label: "คำขอนัดหมายรอพิจารณา",
      hospitalQueue: { tab, hospitals: [{ hospitalId, count: 2 }, { hospitalId: other, count: 4 }, { hospitalId: unauthorized, count: 3 }] } });
    async function scopeFor(): Promise<unknown> {
      const element = await WorkAppointmentPage({ searchParams: Promise.resolve({ hospitalId, tab: "PENDING_REQUESTS" }) });
      return (element.props as { pendingScope: unknown }).pendingScope;
    }
    beforeEach(() => { mocks.list.mockResolvedValue(page); });

    it("names only Hospitals in the page's authorized scope and their own counts", async () => {
      mocks.pendingActions.mockResolvedValue({ status: "READY", checkedAt: 0, indicators: [indicator("PENDING_REQUESTS")] });
      expect(await scopeFor()).toEqual({ tab: "PENDING_REQUESTS", totalCount: 6, hospitals: [
        { hospitalId, hospitalName: "รพ. ก", count: 2 }, { hospitalId: other, hospitalName: "รพ. ข", count: 4 },
      ] });
      expect(mocks.pendingActions).toHaveBeenCalledExactlyOnceWith(owner.userId);
    });

    it("shows no scope for another queue, no pending work or unavailable indicators", async () => {
      mocks.pendingActions.mockResolvedValue({ status: "READY", checkedAt: 0, indicators: [indicator("AWAITING_MY_ACCEPTANCE")] });
      expect(await scopeFor()).toBeNull();
      mocks.pendingActions.mockResolvedValue({ status: "READY", checkedAt: 0, indicators: [] });
      expect(await scopeFor()).toBeNull();
      mocks.pendingActions.mockResolvedValue({ status: "UNAVAILABLE", checkedAt: 0 });
      expect(await scopeFor()).toBeNull();
    });

    it("keeps an indicator access denial on the page's protected handling", async () => {
      mocks.pendingActions.mockRejectedValue(new ForbiddenError());
      await expect(WorkAppointmentPage({ searchParams: Promise.resolve({ hospitalId }) })).rejects.toThrow("REDIRECT:/app");
      mocks.pendingActions.mockRejectedValue(new UnauthenticatedError());
      await expect(WorkAppointmentPage({ searchParams: Promise.resolve({ hospitalId }) })).rejects.toThrow("REDIRECT:/login");
    });
  });
});
