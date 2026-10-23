import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), detail: vi.fn(), management: vi.fn(), relationships: vi.fn(), resources: vi.fn(), summary: vi.fn(), notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("../services/delegated-appointment-query-service", () => ({ getDelegatedAppointment: mocks.detail }));
vi.mock("../services/appointment-grant-management-query-service", () => ({ getAppointmentGrantManagement: mocks.management }));
vi.mock("../services/caregiver-relationship-query-service", () => ({ getFamilyManagementOverview: mocks.relationships }));
vi.mock("../services/caregiver-resource-grant-service", () => ({ getResourceGrantManagement: mocks.resources }));
vi.mock("../services/family-health-summary-query-service", () => ({ getFamilyHealthSummary: mocks.summary }));
import { getFamilyAppointmentWorkspacePageContext, getDelegatedAppointmentPageContext, getFamilyHealthSummaryPageContext } from "./appointment-grant-page-context";
beforeEach(() => {
  vi.resetAllMocks(); mocks.actor.mockResolvedValue({ userId: "current" });
  mocks.notFound.mockImplementation(() => { throw new Error("safe-not-found"); });
  mocks.redirect.mockImplementation(() => { throw new Error("safe-redirect"); });
});
describe("delegated page transport", () => {
  it.each([new ForbiddenError(), new NotFoundError()])("maps denied/unknown scope to the same unavailable page", async (error) => {
    mocks.detail.mockRejectedValue(error);
    await expect(getDelegatedAppointmentPageContext("foreign", "unknown")).rejects.toThrow("safe-not-found");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
  it("redirects unauthenticated users before reading", async () => {
    mocks.actor.mockRejectedValue(new UnauthenticatedError());
    await expect(getDelegatedAppointmentPageContext("grant", "appointment")).rejects.toThrow("safe-redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/login"); expect(mocks.detail).not.toHaveBeenCalled();
  });
  it("preserves disabled management as null and surfaces infrastructure failures", async () => {
    mocks.management.mockResolvedValue(null);
    mocks.resources.mockResolvedValue(null);
    mocks.relationships.mockResolvedValue({ caregiver: { relationships: [] } });
    expect(await getFamilyAppointmentWorkspacePageContext({}, {})).toEqual({ overview: { caregiver: { relationships: [] } }, management: null, resources: null });
    expect(mocks.actor).toHaveBeenCalledTimes(1);
    mocks.detail.mockRejectedValue(new Error("infrastructure"));
    await expect(getDelegatedAppointmentPageContext("grant", "appointment")).rejects.toThrow("infrastructure");
  });
  it("AF-5: an unauthorized or foreign family summary is the same plain 404", async () => {
    mocks.summary.mockRejectedValue(new NotFoundError());
    await expect(getFamilyHealthSummaryPageContext("foreign")).rejects.toThrow("safe-not-found");
    expect(mocks.summary).toHaveBeenCalledWith({ userId: "current" }, "foreign");
  });
});
