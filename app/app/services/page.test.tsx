import { renderToStaticMarkup } from "react-dom/server";
import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { CARE_SIGNALS, CARE_STAGES } from "@/modules/care-tracking/domain/care-stage";
import {
  getCareTrackingPage,
  listCareTrackingScopes,
  type CareTrackingPage,
} from "@/modules/care-tracking/services/care-tracking-query-service";
import { ForbiddenError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";

import ServicesPage from "./page";

const { mockedRedirect } = vi.hoisted(() => ({ mockedRedirect: vi.fn() }));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: vi.fn() }));
vi.mock("@/modules/care-tracking/services/care-tracking-query-service", () => ({
  getCareTrackingPage: vi.fn(),
  listCareTrackingScopes: vi.fn(),
}));

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "44444444-4444-4444-8444-444444444444";
const member: ActorContext = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{ hospitalId: hospitalA, membershipType: MembershipType.MEMBER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
  osmHospitalRelationships: [],
};

function emptyPage(page = 1): CareTrackingPage {
  const zero = <K extends string>(keys: readonly K[]): Record<K, number> => Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  return {
    hospital: { id: hospitalA, name: "โรงพยาบาล ก", access: "DIRECT" },
    summary: { total: 0, stages: zero(CARE_STAGES), signals: zero(CARE_SIGNALS) },
    items: [],
    page,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  };
}

async function renderPage(searchParams: Record<string, string | string[] | undefined>): Promise<string> {
  return renderToStaticMarkup(await ServicesPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("CT-2 /app/services page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
    vi.mocked(getProtectedApplicationActor).mockResolvedValue(member);
    vi.mocked(listCareTrackingScopes).mockResolvedValue([
      { hospitalId: hospitalA, hospitalName: "โรงพยาบาล ก", access: "DIRECT" },
      { hospitalId: hospitalB, hospitalName: "โรงพยาบาล ข", access: "DIRECT" },
    ]);
    vi.mocked(getCareTrackingPage).mockResolvedValue(emptyPage());
  });

  it("loads the first scope and passes the parsed URL state to getCareTrackingPage only", async () => {
    const html = await renderPage({ stage: ["IN_ROUND", "AWAITING_AFTER"], signal: "stale", search: " สมชาย ", includeEnded: "1", page: "2" });

    expect(getCareTrackingPage).toHaveBeenCalledWith(member, {
      hospitalId: hospitalA,
      stages: ["IN_ROUND", "AWAITING_AFTER"],
      signals: ["stale"],
      search: "สมชาย",
      includeEnded: true,
      page: 2,
    });
    expect(html).toContain("จัดบริการ");
  });

  it("uses the requested direct scope", async () => {
    await renderPage({ hospitalId: hospitalB });
    expect(vi.mocked(getCareTrackingPage).mock.calls[0]?.[1]).toMatchObject({ hospitalId: hospitalB });
  });

  it("falls back to the defaults for invalid values instead of failing", async () => {
    const html = await renderPage({ stage: "BOGUS", signal: ["x"], includeEnded: "yes", page: "-1", search: "ก".repeat(500) });

    expect(getCareTrackingPage).toHaveBeenCalledWith(member, {
      hospitalId: hospitalA, stages: [], signals: [], search: "", includeEnded: false, page: 1,
    });
    expect(html).toContain("ยังไม่มีผู้ป่วยที่ต้องจัดบริการในโรงพยาบาลนี้");
  });

  it("redirects an out-of-scope Hospital to the workspace default", async () => {
    await expect(renderPage({ hospitalId: "55555555-5555-4555-8555-555555555555" })).rejects.toThrow("NEXT_REDIRECT:/app/services");
    expect(getCareTrackingPage).not.toHaveBeenCalled();
  });

  it("returns to the work home without any scope or on a forbidden read", async () => {
    vi.mocked(listCareTrackingScopes).mockResolvedValueOnce([]);
    await expect(renderPage({})).rejects.toThrow("NEXT_REDIRECT:/app");

    vi.mocked(listCareTrackingScopes).mockRejectedValueOnce(new ForbiddenError());
    await expect(renderPage({})).rejects.toThrow("NEXT_REDIRECT:/app");

    vi.mocked(getCareTrackingPage).mockRejectedValueOnce(new ForbiddenError());
    await expect(renderPage({})).rejects.toThrow("NEXT_REDIRECT:/app");
  });

  it("sends an unauthenticated visitor to login", async () => {
    vi.mocked(getProtectedApplicationActor).mockRejectedValueOnce(new UnauthenticatedError());
    await expect(renderPage({})).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("shows a validation message and lets other failures reach the error boundary", async () => {
    vi.mocked(getCareTrackingPage).mockRejectedValueOnce(new ValidationError("bad"));
    expect(await renderPage({})).toContain("ไม่สามารถค้นหาได้");

    vi.mocked(getCareTrackingPage).mockRejectedValueOnce(new Error("database down"));
    await expect(renderPage({})).rejects.toThrow("database down");
  });
});
