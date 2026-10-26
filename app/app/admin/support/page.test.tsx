import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getActor: vi.fn(),
  listAdmin: vi.fn(),
  getAdmin: vi.fn(),
  listOwnHospitals: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: () => mocks.getActor(),
}));
vi.mock("@/modules/support/services/support-report-service", () => ({
  listAdminSupportReports: mocks.listAdmin,
  getAdminSupportReport: mocks.getAdmin,
  listOwnSupportHospitals: mocks.listOwnHospitals,
  listOwnSupportReports: vi.fn(),
  getOwnSupportReport: vi.fn(),
}));

import SupportPage from "../../support/page";
import AdminSupportReportDetailPage from "./[reportId]/page";
import AdminSupportInboxPage from "./page";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

const admin: ActorContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: [Role.ADMIN],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const owner: ActorContext = {
  ...admin,
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{ hospitalId: "33333333-3333-4333-8333-333333333333", membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
};
const reportId = "44444444-4444-4444-8444-444444444444";
const inboxPage = (params: Record<string, string> = {}) => AdminSupportInboxPage({ searchParams: Promise.resolve(params) });
const detailPage = () => AdminSupportReportDetailPage({ params: Promise.resolve({ reportId }) });

// WB-DF-14 (Product Owner 2026-10-26): only the platform ADMIN reads and manages usage-problem reports.
describe("Platform ADMIN support inbox routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getActor.mockResolvedValue(admin);
    mocks.listAdmin.mockResolvedValue({ items: [], nextCursor: null });
    mocks.getAdmin.mockResolvedValue({
      id: reportId, category: "BUG", status: "NEW", createdAt: "2026-10-26T01:00:00.000Z", updatedAt: "2026-10-26T01:00:00.000Z",
      resolvedAt: null, hospitalName: null, hospital: null, message: "ข้อความรายงาน",
    });
    mocks.listOwnHospitals.mockResolvedValue([]);
    mocks.redirect.mockImplementation((href: string) => { throw new Error(`REDIRECT:${href}`); });
    mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
  });

  it("loads the cross-Hospital inbox with the requested filters for an ADMIN", async () => {
    await inboxPage({ status: "NEW", category: "ACCESS" });

    expect(mocks.listAdmin).toHaveBeenCalledWith(admin, { status: "NEW", category: "ACCESS" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects a Hospital OWNER from the inbox and detail before any report is read", async () => {
    mocks.getActor.mockResolvedValue(owner);

    await expect(inboxPage()).rejects.toThrow("REDIRECT:/app");
    await expect(detailPage()).rejects.toThrow("REDIRECT:/app");

    expect(mocks.listAdmin).not.toHaveBeenCalled();
    expect(mocks.getAdmin).not.toHaveBeenCalled();
  });

  it("redirects an ADMIN the database no longer confirms", async () => {
    mocks.listAdmin.mockRejectedValue(new ForbiddenError());
    mocks.getAdmin.mockRejectedValue(new ForbiddenError());

    await expect(inboxPage()).rejects.toThrow("REDIRECT:/app");
    await expect(detailPage()).rejects.toThrow("REDIRECT:/app");
  });

  it("sends an unauthenticated requester to login", async () => {
    mocks.getActor.mockRejectedValue(new UnauthenticatedError());

    await expect(inboxPage()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.listAdmin).not.toHaveBeenCalled();
  });

  it("keeps an ADMIN, alone or with another role, out of the submit form", async () => {
    for (const roles of [[Role.ADMIN], [Role.ADMIN, Role.PATIENT], [Role.ADMIN, Role.HOSPITAL]]) {
      mocks.getActor.mockResolvedValue({ ...admin, roles });
      await expect(SupportPage()).rejects.toThrow("REDIRECT:/app");
    }
    expect(mocks.listOwnHospitals).not.toHaveBeenCalled();
  });

  it("opens the submit form for a CAREGIVER-only account without a Hospital", async () => {
    const caregiver = { ...admin, roles: [Role.CAREGIVER] };
    mocks.getActor.mockResolvedValue(caregiver);

    await SupportPage();

    expect(mocks.listOwnHospitals).toHaveBeenCalledWith(caregiver);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
