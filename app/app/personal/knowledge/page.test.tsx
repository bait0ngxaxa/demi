import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, InfrastructureError, NotFoundError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";
const h = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), detail: vi.fn(), resolvePatient: vi.fn(), connection: vi.fn() }));
vi.mock("next/server", () => ({ connection: h.connection }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: h.actor }));
vi.mock("@/modules/hospital-content/services/hospital-content-patient-query-service", () => ({ listPatientHospitalContent: h.list, getPatientHospitalContent: h.detail }));
vi.mock("@/modules/patient-self/services/patient-self-query-service", () => ({ resolveOwnPatientContext: h.resolvePatient }));
import Page from "./page";
import DetailPage from "./[contentId]/page";
import { getHospitalContentPatientFeedContext } from "@/modules/hospital-content/transport/hospital-content-patient-page-context";
const relationshipId = "44444444-4444-4444-8444-444444444444";
const hospitalId = "55555555-5555-4555-8555-555555555555";
const patient = {
  person: { givenName: "สมชาย", familyName: "ใจดี" },
  hospitalRelationships: [{
    relationshipId,
    hospitalId,
    hospitalCode: "H-001",
    hospitalName: "โรงพยาบาล ก",
    hospitalNumber: null,
    hospitalStatus: "ACTIVE",
    careEndedAt: null,
  }],
};
beforeEach(() => { vi.clearAllMocks(); h.actor.mockResolvedValue({ userId: "private-user", personId: "private-person" }); h.resolvePatient.mockResolvedValue(patient); h.list.mockResolvedValue({ category: null, items: [], nextCursor: null, emptyState: "EMPTY_A" }); h.detail.mockResolvedValue({ id: "content-locator" }); });
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
  it("maps only an active own relationship to the Hospital filter", async () => {
    const context = await getHospitalContentPatientFeedContext({ category: "NEWS", hospital: relationshipId });

    expect(context).toMatchObject({ outcome: "READY", hospitalRelationshipId: relationshipId });
    expect(h.resolvePatient).toHaveBeenCalledWith({ userId: "private-user", personId: "private-person" });
    expect(h.list).toHaveBeenCalledWith(
      { userId: "private-user", personId: "private-person" },
      { category: "NEWS", hospitalId },
    );
  });
  it.each([
    { relationshipId: "66666666-6666-4666-8666-666666666666", careEndedAt: null, hospitalStatus: "ACTIVE" },
    { relationshipId, careEndedAt: new Date("2026-10-01T00:00:00.000Z"), hospitalStatus: "ACTIVE" },
    { relationshipId, careEndedAt: null, hospitalStatus: "SUSPENDED" },
  ])("does not widen the feed for a foreign, ended or inactive relationship", async (unavailable) => {
    h.resolvePatient.mockResolvedValue({
      ...patient,
      hospitalRelationships: [{ ...patient.hospitalRelationships[0], ...unavailable }],
    });
    const context = await getHospitalContentPatientFeedContext({ hospital: relationshipId });

    expect(context.outcome).toBe("VALIDATION");
    expect(h.list).not.toHaveBeenCalled();
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
