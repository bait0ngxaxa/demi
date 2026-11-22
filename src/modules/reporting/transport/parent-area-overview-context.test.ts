import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

import { PARENT_CHILD_REPORT_BATCH_MAX_CHILDREN } from "../schemas/hospital-report-schemas";

const { mockedGetActor, mockedListHospitals, mockedListParentGroups, mockedGetParentChildPages, mockedRedirect } = vi.hoisted(() => ({
  mockedGetActor: vi.fn(),
  mockedListHospitals: vi.fn(),
  mockedListParentGroups: vi.fn(),
  mockedGetParentChildPages: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mockedGetActor }));
vi.mock("../services/hospital-report-access-service", () => ({ listHospitalReportingHospitals: mockedListHospitals }));
vi.mock("../services/parent-child-hospital-report-access-service", () => ({
  listParentChildHospitalReportTargetGroups: mockedListParentGroups,
}));
vi.mock("../services/hospital-report-query-service", () => ({
  getParentChildHospitalReportingPages: mockedGetParentChildPages,
}));

import { getParentAreaOverviewContext } from "./parent-area-overview-context";

const actor = { userId: "33333333-3333-4333-8333-333333333333" };
const parent = { id: "11111111-1111-4111-8111-111111111111", name: "แม่ข่าย" };
const childA = { id: "22222222-2222-4222-8222-222222222222", name: "ลูกข่าย ก" };
const childB = { id: "44444444-4444-4444-8444-444444444444", name: "ลูกข่าย ข" };
const childC = { id: "55555555-5555-4555-8555-555555555555", name: "ลูกข่าย ค" };

describe("Parent area overview context (ADR-0013)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActor.mockResolvedValue(actor);
    mockedListHospitals.mockResolvedValue([{ id: parent.id }]);
    mockedListParentGroups.mockResolvedValue([{ parent, children: [childA, childB, childC] }]);
    mockedRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("reads a Parent's listed Children in one batch and drops revoked or ineligible Children", async () => {
    mockedGetParentChildPages.mockResolvedValue(new Map([
      [childA.id, { hospital: childA, parent }],
      [childB.id, null],
      [childC.id, null],
    ]));

    const groups = await getParentAreaOverviewContext();

    expect(mockedListParentGroups).toHaveBeenCalledWith(actor, [parent.id]);
    expect(mockedGetParentChildPages).toHaveBeenCalledTimes(1);
    expect(mockedGetParentChildPages).toHaveBeenCalledWith(actor, {
      parentHospitalId: parent.id,
      hospitalIds: [childA.id, childB.id, childC.id],
    });
    expect(groups).toEqual([{ parent, children: [childA, childB, childC], areas: [{ hospital: childA, parent }] }]);
  });

  it("reads each Parent separately and preserves the listed Parent/Child order", async () => {
    const children = Array.from({ length: 9 }, (_, index) => ({
      id: `child-${index}`,
      name: `ลูกข่าย ${index}`,
    }));
    const secondParent = { id: "parent-2", name: "แม่ข่าย 2" };
    mockedListParentGroups.mockResolvedValue([
      { parent, children: children.slice(0, 5) },
      { parent: secondParent, children: children.slice(5) },
    ]);
    mockedGetParentChildPages.mockImplementation(async (_actor, input: { hospitalIds: string[] }) =>
      new Map([...input.hospitalIds].reverse().map((id) => [id, { hospital: { id } }])));

    const groups = await getParentAreaOverviewContext();

    expect(mockedGetParentChildPages.mock.calls.map(([, input]) => input)).toEqual([
      { parentHospitalId: parent.id, hospitalIds: children.slice(0, 5).map(({ id }) => id) },
      { parentHospitalId: secondParent.id, hospitalIds: children.slice(5).map(({ id }) => id) },
    ]);
    expect(groups.map(({ parent: groupParent }) => groupParent.id)).toEqual([parent.id, secondParent.id]);
    expect(groups.flatMap(({ areas }) => areas.map(({ hospital }) => hospital.id))).toEqual(
      children.map(({ id }) => id),
    );
  });

  it("reads a network larger than one batch in consecutive bounded batches, in listed order", async () => {
    const children = Array.from({ length: PARENT_CHILD_REPORT_BATCH_MAX_CHILDREN + 1 }, (_, index) => ({
      id: `child-${index}`,
      name: `ลูกข่าย ${index}`,
    }));
    mockedListParentGroups.mockResolvedValue([{ parent, children }]);
    let inFlight = 0;
    let peakInFlight = 0;
    mockedGetParentChildPages.mockImplementation(async (_actor, input: { hospitalIds: string[] }) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return new Map(input.hospitalIds.map((id) => [id, { hospital: { id } }]));
    });

    const groups = await getParentAreaOverviewContext();

    expect(mockedGetParentChildPages.mock.calls.map(([, input]) => input.hospitalIds.length))
      .toEqual([PARENT_CHILD_REPORT_BATCH_MAX_CHILDREN, 1]);
    expect(peakInFlight).toBe(1);
    expect(groups[0]?.areas.map(({ hospital }) => hospital.id)).toEqual(children.map(({ id }) => id));
  });

  it("drops every Child of a Parent the actor lost after listing, keeping the other Parents", async () => {
    const secondParent = { id: "parent-2", name: "แม่ข่าย 2" };
    mockedListParentGroups.mockResolvedValue([
      { parent, children: [childA] },
      { parent: secondParent, children: [childB] },
    ]);
    mockedGetParentChildPages.mockImplementation(async (_actor, input: { parentHospitalId: string }) => {
      if (input.parentHospitalId === parent.id) throw new ForbiddenError();
      return new Map([[childB.id, { hospital: childB, parent: secondParent }]]);
    });

    await expect(getParentAreaOverviewContext()).resolves.toEqual([
      { parent, children: [childA], areas: [] },
      { parent: secondParent, children: [childB], areas: [{ hospital: childB, parent: secondParent }] },
    ]);
  });

  it("returns an empty active network without issuing Child report queries", async () => {
    mockedListParentGroups.mockResolvedValue([{ parent, children: [] }]);

    await expect(getParentAreaOverviewContext()).resolves.toEqual([{ parent, children: [], areas: [] }]);
    expect(mockedGetParentChildPages).not.toHaveBeenCalled();
  });

  it("sends a user who directly owns no Parent back to the work home", async () => {
    mockedListParentGroups.mockResolvedValue([]);

    await expect(getParentAreaOverviewContext()).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(mockedGetParentChildPages).not.toHaveBeenCalled();
  });

  it("does not hide infrastructure failures as missing areas", async () => {
    mockedGetParentChildPages.mockRejectedValue(new InfrastructureError("down"));

    await expect(getParentAreaOverviewContext()).rejects.toBeInstanceOf(InfrastructureError);
  });
});
