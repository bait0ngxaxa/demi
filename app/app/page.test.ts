import { beforeEach, describe, expect, it, vi } from "vitest";
import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";

import ApplicationPage from "./page";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listActorHospitalWorkspaces } from "@/modules/auth/services/actor-workspace-service";

const { mockedRedirect } = vi.hoisted(() => ({ mockedRedirect: vi.fn() }));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: vi.fn(),
}));
vi.mock("@/modules/auth/services/actor-workspace-service", () => ({
  listActorHospitalWorkspaces: vi.fn().mockResolvedValue([]),
}));

const patientActor = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.PATIENT],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

describe("application home workspace routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProtectedApplicationActor).mockResolvedValue(patientActor);
    vi.mocked(listActorHospitalWorkspaces).mockResolvedValue([]);
    mockedRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("sends a Patient-only account to Personal Home", async () => {
    await expect(ApplicationPage()).rejects.toThrow("NEXT_REDIRECT:/app/personal");
    expect(mockedRedirect).toHaveBeenCalledWith("/app/personal");
  });

  it("keeps a multi-role Patient and OSM on the Work home by default", async () => {
    vi.mocked(getProtectedApplicationActor).mockResolvedValue({
      ...patientActor,
      roles: [Role.OSM, Role.PATIENT],
      osmHospitalRelationships: [
        {
          hospitalId: "44444444-4444-4444-8444-444444444444",
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });

    const page = await ApplicationPage();

    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(getProtectedApplicationActor).toHaveBeenCalledOnce();
    expect(page).toBeDefined();
  });
});
