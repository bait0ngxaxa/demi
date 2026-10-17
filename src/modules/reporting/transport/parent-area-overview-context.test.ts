import { beforeEach, describe, expect, it, vi } from "vitest";

import { InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

const { mockedGetActor, mockedListHospitals, mockedListParentGroups, mockedGetParentChildPage, mockedRedirect } = vi.hoisted(() => ({
  mockedGetActor: vi.fn(),
  mockedListHospitals: vi.fn(),
  mockedListParentGroups: vi.fn(),
  mockedGetParentChildPage: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mockedGetActor }));
vi.mock("../services/hospital-report-access-service", () => ({ listHospitalReportingHospitals: mockedListHospitals }));
vi.mock("../services/parent-child-hospital-report-access-service", () => ({
  listParentChildHospitalReportTargetGroups: mockedListParentGroups,
}));
vi.mock("../services/hospital-report-query-service", () => ({
  getParentChildHospitalReportingPage: mockedGetParentChildPage,
}));

import { getParentAreaOverviewContext } from "./parent-area-overview-context";

const actor = { userId: "33333333-3333-4333-8333-333333333333" };
const parent = { id: "11111111-1111-4111-8111-111111111111", name: "แม่ข่าย" };
const childA = { id: "22222222-2222-4222-8222-222222222222", name: "ลูกข่าย ก" };
const childB = { id: "44444444-4444-4444-8444-444444444444", name: "ลูกข่าย ข" };

describe("Parent area overview context (ADR-0013)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetActor.mockResolvedValue(actor);
    mockedListHospitals.mockResolvedValue([{ id: parent.id }]);
    mockedListParentGroups.mockResolvedValue([{ parent, children: [childA, childB] }]);
    mockedRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("reads each listed Child through the exact-Child summary path and drops a Child that is no longer eligible", async () => {
    mockedGetParentChildPage.mockImplementation(async (_actor, input: { hospitalId: string }) => {
      if (input.hospitalId === childB.id) throw new NotFoundError();
      return { hospital: childA, parent };
    });

    const groups = await getParentAreaOverviewContext();

    expect(mockedListParentGroups).toHaveBeenCalledWith(actor, [parent.id]);
    expect(mockedGetParentChildPage).toHaveBeenCalledWith(actor, { parentHospitalId: parent.id, hospitalId: childA.id });
    expect(mockedGetParentChildPage).toHaveBeenCalledWith(actor, { parentHospitalId: parent.id, hospitalId: childB.id });
    expect(groups).toEqual([{ parent, areas: [{ hospital: childA, parent }] }]);
  });

  it("sends a user who directly owns no Parent back to the work home", async () => {
    mockedListParentGroups.mockResolvedValue([]);

    await expect(getParentAreaOverviewContext()).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(mockedGetParentChildPage).not.toHaveBeenCalled();
  });

  it("does not hide infrastructure failures as missing areas", async () => {
    mockedGetParentChildPage.mockRejectedValue(new InfrastructureError("down"));

    await expect(getParentAreaOverviewContext()).rejects.toBeInstanceOf(InfrastructureError);
  });
});
