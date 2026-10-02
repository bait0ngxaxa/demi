import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), detail: vi.fn(), management: vi.fn(), relationships: vi.fn(), notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("../services/delegated-appointment-query-service", () => ({ listDelegatedAppointments: mocks.list, getDelegatedAppointment: mocks.detail }));
vi.mock("../services/appointment-grant-management-query-service", () => ({ getAppointmentGrantManagement: mocks.management }));
vi.mock("../services/caregiver-relationship-query-service", () => ({ getFamilyManagementOverview: mocks.relationships }));
import { getFamilyAppointmentWorkspacePageContext, getDelegatedAppointmentPageContext, getDelegatedAppointmentsPageContext } from "./appointment-grant-page-context";
beforeEach(() => {
  vi.resetAllMocks(); mocks.actor.mockResolvedValue({ userId: "current" });
  mocks.notFound.mockImplementation(() => { throw new Error("safe-not-found"); });
  mocks.redirect.mockImplementation(() => { throw new Error("safe-redirect"); });
});
describe("delegated page transport", () => {
  it.each([new ForbiddenError(), new NotFoundError()])("maps denied/unknown scope to the same unavailable page", async (error) => {
    mocks.list.mockRejectedValue(error); mocks.detail.mockRejectedValue(error);
    await expect(getDelegatedAppointmentsPageContext({ grantId: "foreign" })).rejects.toThrow("safe-not-found");
    await expect(getDelegatedAppointmentPageContext("foreign", "unknown")).rejects.toThrow("safe-not-found");
    expect(mocks.notFound).toHaveBeenCalledTimes(2);
  });
  it("redirects unauthenticated users before reading", async () => {
    mocks.actor.mockRejectedValue(new UnauthenticatedError());
    await expect(getDelegatedAppointmentsPageContext({})).rejects.toThrow("safe-redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/login"); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("preserves disabled management as null and surfaces infrastructure failures", async () => {
    mocks.management.mockResolvedValue(null);
    mocks.relationships.mockResolvedValue({ caregiver: { relationships: [] } });
    expect(await getFamilyAppointmentWorkspacePageContext({}, {})).toEqual({ overview: { caregiver: { relationships: [] } }, management: null });
    expect(mocks.actor).toHaveBeenCalledTimes(1);
    mocks.detail.mockRejectedValue(new Error("infrastructure"));
    await expect(getDelegatedAppointmentPageContext("grant", "appointment")).rejects.toThrow("infrastructure");
  });
});
