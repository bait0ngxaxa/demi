import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, InfrastructureError, NotFoundError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";
const h = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), detail: vi.fn(), connection: vi.fn() }));
vi.mock("next/server", () => ({ connection: h.connection }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: h.actor }));
vi.mock("@/modules/hospital-content/services/hospital-content-patient-query-service", () => ({ listPatientHospitalContent: h.list, getPatientHospitalContent: h.detail }));
import Page from "./page";
import DetailPage from "./[contentId]/page";
beforeEach(() => { vi.clearAllMocks(); h.actor.mockResolvedValue({ userId: "private-user", personId: "private-person" }); h.list.mockResolvedValue({ category: null, items: [], nextCursor: null, emptyState: "EMPTY_A" }); h.detail.mockResolvedValue({ id: "content-locator" }); });
describe("Patient Content request-time routes", () => {
  it("connection precedes actor and feed reads; independent request generation exposes no Patient IDs", async () => {
    const first = await Page({ searchParams: Promise.resolve({ category: "FOOD" }) });
    const second = await Page({ searchParams: Promise.resolve({}) });
    expect(h.connection.mock.invocationCallOrder[0]).toBeLessThan(h.actor.mock.invocationCallOrder[0]);
    expect(h.list).toHaveBeenCalledWith({ userId: "private-user", personId: "private-person" }, { category: "FOOD" });
    expect(first.key).not.toBe(second.key); expect(first.key).toMatch(/^[a-f0-9-]{36}$/u);
    expect(JSON.stringify(first.props)).not.toContain("private-user");
  });
  it("detail independently resolves current actor after connection", async () => {
    await DetailPage({ params: Promise.resolve({ contentId: "locator" }) });
    expect(h.detail).toHaveBeenCalledWith({ userId: "private-user", personId: "private-person" }, "locator");
    expect(h.connection.mock.invocationCallOrder[0]).toBeLessThan(h.actor.mock.invocationCallOrder[0]);
  });
  it.each([{ error: new UnauthenticatedError(), path: "/login" }, { error: new ForbiddenError(), path: "/app" }])("safe authority outcome $path", async ({ error, path }) => {
    h.actor.mockRejectedValue(error); await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(`redirect:${path}`); expect(h.list).not.toHaveBeenCalled();
  });
  it("invalid request renders Validation, never an empty projection; infrastructure escapes to error boundary", async () => {
    h.list.mockRejectedValue(new ValidationError()); const tree = await Page({ searchParams: Promise.resolve({ category: "" }) });
    expect(tree.props.children.props.context.outcome).toBe("VALIDATION");
    h.list.mockRejectedValue(new InfrastructureError()); await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toBeInstanceOf(InfrastructureError);
  });
  it("unavailable detail maps to safe NotFound; persisted authority loss uses /app", async () => {
    h.detail.mockRejectedValue(new NotFoundError()); await expect(DetailPage({ params: Promise.resolve({ contentId: "foreign" }) })).rejects.toThrow("notFound");
    h.detail.mockRejectedValue(new ForbiddenError()); await expect(DetailPage({ params: Promise.resolve({ contentId: "foreign" }) })).rejects.toThrow("redirect:/app");
  });
});
