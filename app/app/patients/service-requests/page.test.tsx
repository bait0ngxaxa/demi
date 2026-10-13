import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), redirect: vi.fn(), connection: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("@/modules/patient-service-requests/services/patient-service-request-service", () => ({ listHospitalPatientServiceRequests: mocks.list }));
vi.mock("./hospital-service-requests-workspace", () => ({ HospitalPatientServiceRequestsWorkspace: () => null }));
import Page from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ userId: "trusted" });
  mocks.list.mockResolvedValue({ requests: [], group: "PENDING", after: undefined, nextCursor: null });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});

describe("Hospital service requests page", () => {
  it("defaults to reviewable actor-wide scope, ignoring unsupported selected Hospital", async () => {
    await Page({ searchParams: Promise.resolve({ hospitalId: "forged" }) });
    expect(mocks.list).toHaveBeenCalledWith({ userId: "trusted" }, {}, { group: "PENDING", after: undefined });
  });

  it("passes validated group and composite cursor to the bounded service", async () => {
    const after = { createdAt: "2026-10-01T00:00:00.000Z", requestId: "11111111-1111-4111-8111-111111111111" };
    await Page({ searchParams: Promise.resolve({ group: "HISTORY", afterDate: after.createdAt, afterId: after.requestId }) });
    expect(mocks.list).toHaveBeenCalledWith({ userId: "trusted" }, {}, { group: "HISTORY", after });
  });

  it.each([{ group: ["PENDING", "HISTORY"] }, { group: "STARTED" }, { afterId: "bad" }, { afterDate: "bad", afterId: "bad" }])("recovers invalid parameters explicitly: %j", async (query) => {
    const element = await Page({ searchParams: Promise.resolve(query) });
    expect(mocks.list).toHaveBeenCalledWith({ userId: "trusted" }, {}, {});
    expect(element.props).toMatchObject({ invalidQuery: true });
  });

  it.each([[new UnauthenticatedError(), "/login"], [new ForbiddenError(), "/app"]])("keeps authoritative destination denial", async (error, path) => {
    mocks.list.mockRejectedValue(error);
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(`redirect:${path}`);
  });
});
