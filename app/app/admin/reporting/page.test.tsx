import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  directoryContext: vi.fn(),
  hospitalContext: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("next/server", () => ({ connection: async (): Promise<void> => undefined }));
vi.mock("@/modules/reporting/transport/global-reporting-page-context", () => ({
  getGlobalReportingDirectoryPageContext: mocks.directoryContext,
  getGlobalHospitalReportPageContext: mocks.hospitalContext,
}));

import GlobalAdminReportingPage from "./page";
import GlobalHospitalReportPage from "./hospitals/[hospitalId]/page";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function directoryPage(query: Record<string, string | string[]>): Promise<React.JSX.Element> {
  return GlobalAdminReportingPage({ searchParams: Promise.resolve(query) });
}

function hospitalPage(id: string, query: Record<string, string | string[]> = {}): Promise<React.JSX.Element> {
  return GlobalHospitalReportPage({ params: Promise.resolve({ hospitalId: id }), searchParams: Promise.resolve(query) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
  mocks.directoryContext.mockResolvedValue({ directory: {} });
  mocks.hospitalContext.mockResolvedValue({ hierarchy: {}, page: null });
});

describe("Global ADMIN system report directory page", () => {
  it("moves an old ?hospitalId= link to the Hospital's own page with every report parameter", async () => {
    await expect(directoryPage({
      hospitalId: hospitalId.toUpperCase(),
      cursor: "c1",
      pageSize: "20",
      view: "service",
      search: "สมชาย",
      progress: "3",
      status: "ACTIVE",
    })).rejects.toThrow(
      `NEXT_REDIRECT:/app/admin/reporting/hospitals/${hospitalId}?cursor=c1&pageSize=20&view=service&search=%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2&progress=3&status=ACTIVE`,
    );
    expect(mocks.directoryContext).not.toHaveBeenCalled();
    expect(mocks.hospitalContext).not.toHaveBeenCalled();
  });

  it("moves an old link without report parameters to the bare Hospital page", async () => {
    await expect(directoryPage({ hospitalId })).rejects.toThrow(`NEXT_REDIRECT:/app/admin/reporting/hospitals/${hospitalId}`);
  });

  it("rejects a malformed old link instead of redirecting it", async () => {
    await expect(directoryPage({ hospitalId: "not-a-uuid" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(directoryPage({ hospitalId, q: "x" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(directoryPage({ hospitalId: [hospitalId, hospitalId] })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("reads only the directory, never a Hospital report", async () => {
    await directoryPage({ q: "แม่ข่าย", hospitalStatus: "ACTIVE" });
    expect(mocks.directoryContext).toHaveBeenCalledOnce();
    expect(mocks.hospitalContext).not.toHaveBeenCalled();
  });

  it("rejects unknown keys and invalid directory filters", async () => {
    await expect(directoryPage({ cursor: "c1" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(directoryPage({ view: "service" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(directoryPage({ hospitalStatus: "RETIRED" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(directoryPage({ q: "ก".repeat(101) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.directoryContext).not.toHaveBeenCalled();
  });
});

describe("Global ADMIN Hospital report page", () => {
  it("reads the Hospital report only, with the parsed report parameters", async () => {
    await hospitalPage(hospitalId.toUpperCase(), { cursor: "c1", pageSize: "20", search: "HN1", progress: "COMPLETED", status: "ACTIVE", view: "service" });
    expect(mocks.hospitalContext).toHaveBeenCalledExactlyOnceWith({
      hospitalId,
      cursor: "c1",
      pageSize: 20,
      search: "HN1",
      progress: "COMPLETED",
      status: "ACTIVE",
    });
    expect(mocks.directoryContext).not.toHaveBeenCalled();
  });

  it("returns 404 for an invalid Hospital id, unknown keys and malformed report parameters", async () => {
    await expect(hospitalPage("not-a-uuid")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(hospitalPage(hospitalId, { hospitalId })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(hospitalPage(hospitalId, { q: "x" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(hospitalPage(hospitalId, { view: "table" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(hospitalPage(hospitalId, { pageSize: "20.5" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(hospitalPage(hospitalId, { cursor: ["a", "b"] })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.hospitalContext).not.toHaveBeenCalled();
  });
});
