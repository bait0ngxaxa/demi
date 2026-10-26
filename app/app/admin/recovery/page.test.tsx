import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getActor: vi.fn(),
  listQuarantined: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: () => mocks.getActor(),
}));
vi.mock("@/modules/account-security/services/mediated-password-reset-service", () => ({
  listQuarantinedMediatedPasswordResets: mocks.listQuarantined,
}));

import AdminPasswordRecoveryPage from "./page";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { UnauthenticatedError } from "@/shared/errors/application-error";

const admin: ActorContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: [Role.ADMIN],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

describe("Platform ADMIN recovery page authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getActor.mockResolvedValue(admin);
    mocks.listQuarantined.mockResolvedValue([]);
    mocks.redirect.mockImplementation((href: string) => { throw new Error(`REDIRECT:${href}`); });
  });

  it("loads recovery tools and quarantined resets for an authenticated ADMIN", async () => {
    await AdminPasswordRecoveryPage();

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.getActor).toHaveBeenCalledOnce();
    expect(mocks.listQuarantined).toHaveBeenCalledWith(admin);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects an ordinary authenticated user before loading recovery tools", async () => {
    mocks.getActor.mockResolvedValue({ ...admin, roles: [Role.HOSPITAL] });

    await expect(AdminPasswordRecoveryPage()).rejects.toThrow("REDIRECT:/app");

    expect(mocks.listQuarantined).not.toHaveBeenCalled();
  });

  it("sends an unauthenticated requester to login", async () => {
    mocks.getActor.mockRejectedValue(new UnauthenticatedError());

    await expect(AdminPasswordRecoveryPage()).rejects.toThrow("REDIRECT:/login");

    expect(mocks.listQuarantined).not.toHaveBeenCalled();
  });
});
