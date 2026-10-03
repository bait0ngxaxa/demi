import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connection } from "next/server";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listOwnPersonalMedications, getOwnPersonalMedication } from "@/modules/medications/services/personal-medication-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";
import Page from "./page";

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: vi.fn() }));
vi.mock("@/modules/medications/services/personal-medication-query-service", () => ({ listOwnPersonalMedications: vi.fn(), getOwnPersonalMedication: vi.fn() }));
vi.mock("./personal-medication-controls", () => ({ MedicationEditor: () => <div>เพิ่มรายการ</div>, MedicationStopForm: () => <div>หยุดติดตาม</div> }));
const actor = { userId: "user", personId: "person", roles: ["PATIENT" as const], hospitalMemberships: [], osmHospitalRelationships: [] };
describe("request-time protected medication page", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(getProtectedApplicationActor).mockResolvedValue(actor); vi.mocked(listOwnPersonalMedications).mockResolvedValue({ items: [], nextCursor: null }); });
  it("awaits connection before actor and authorizes both bounded lists", async () => {
    expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))).toContain("ยาของฉัน");
    expect(connection).toHaveBeenCalledOnce(); expect(vi.mocked(connection).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(getProtectedApplicationActor).mock.invocationCallOrder[0]);
    expect(listOwnPersonalMedications).toHaveBeenCalledWith(actor, { status: "ACTIVE", cursor: undefined });
    expect(listOwnPersonalMedications).toHaveBeenCalledWith(actor, { status: "STOPPED", cursor: undefined });
  });
  it.each([[new UnauthenticatedError(), "/login"], [new ForbiddenError(), "/app"]] as const)("redirects safe auth errors", async (error, path) => {
    vi.mocked(getProtectedApplicationActor).mockRejectedValue(error);
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(`redirect:${path}`);
  });
  it("uses safe identical not-found presentation for foreign item/cursor", async () => {
    vi.mocked(getOwnPersonalMedication).mockRejectedValue(new NotFoundError());
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ item: "foreign" }) })); expect(html).toContain("ไม่พบรายการที่ต้องการ");
    vi.mocked(listOwnPersonalMedications).mockRejectedValue(new NotFoundError());
    expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ activeCursor: "foreign" }) }))).toContain("โหลดรายการล่าสุด");
  });
  it("actor presentation key remounts every selected-item draft on account change", async () => {
    const first = await Page({ searchParams: Promise.resolve({}) });
    vi.mocked(getProtectedApplicationActor).mockResolvedValue({ ...actor, userId: "different-account" });
    const second = await Page({ searchParams: Promise.resolve({}) });
    expect(first.key).toBeTruthy(); expect(second.key).toBeTruthy(); expect(first.key).not.toBe(second.key);
    expect(first.key).not.toContain(actor.userId);
  });
});
