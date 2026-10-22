import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  getProtectedApplicationActor: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getProtectedApplicationActor,
}));

import PatientDetailPage from "./page";

describe("Patient detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.notFound.mockImplementation(() => {
      throw Object.assign(new Error("notFound"), { notFound: true });
    });
    mocks.getProtectedApplicationActor.mockImplementation(() => {
      throw new Error("Unexpected authentication lookup");
    });
  });

  it("returns a normal 404 for the retired access-request inbox path before authentication", async () => {
    await expect(
      PatientDetailPage({ params: Promise.resolve({ relationshipId: "access-requests" }) }),
    ).rejects.toMatchObject({ notFound: true });

    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.getProtectedApplicationActor).not.toHaveBeenCalled();
  });
});
