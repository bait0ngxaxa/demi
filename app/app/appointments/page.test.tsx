import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getActor: vi.fn(),
  list: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
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

import type { ActorContext } from "@/modules/auth/types/actor-context";

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
  });

  it.each([
    ["unassigned", { unassigned: "true" }],
    ["unassignedOsm", { unassignedOsm: "true" }],
  ] as const)("passes the %s filter from the URL to the list query", async (_name, filter) => {
    await WorkAppointmentPage({ searchParams: Promise.resolve({ hospitalId, tab: "UPCOMING", ...filter }) });

    expect(mocks.list).toHaveBeenCalledExactlyOnceWith(owner, { hospitalId, tab: "UPCOMING", ...filter });
  });
});
