import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  actor: vi.fn(),
  summary: vi.fn(),
  recoveryAvailable: vi.fn(),
  soleOwnerCount: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { ...props, href }, children),
}));
vi.mock("@/components/ui/page-header", () => ({ PageHeader: ({ title }: { title: string }) => createElement("h1", null, title) }));
vi.mock("@/components/ui/panel", () => ({ Panel: ({ children }: { children: ReactNode }) => createElement("section", null, children) }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("@/modules/line/services/line-account-service", () => ({ getLineAccountSummary: mocks.summary }));
vi.mock("@/modules/hospital-governance/services/hospital-owner-recovery-readiness-service", () => ({ countSoleActiveOwnerHospitals: mocks.soleOwnerCount }));
vi.mock("@/modules/line/services/line-password-recovery-configuration", () => ({
  isLinePasswordRecoveryRequestConfigured: mocks.recoveryAvailable,
}));
vi.mock("../../../line/account/line-password-recovery-nudge", () => ({
  LinePasswordRecoveryNudge: ({ userId, href, readiness, soleOwnerHospitalCount }: {
    userId: string;
    href: string;
    readiness?: { status: string };
    soleOwnerHospitalCount?: number | null;
  }) => readiness
    ? createElement("aside", { "data-readiness": readiness.status, "data-sole-owner-count": soleOwnerHospitalCount, "data-user-id": userId }, "คำแนะนำเจ้าของโรงพยาบาล")
    : createElement("aside", { "data-user-id": userId }, createElement("a", { href }, "ผูก LINE เพื่อรีเซ็ตรหัสผ่านเองได้เมื่อลืม")),
}));

import ApplicationLineAccountPage from "./page";

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await ApplicationLineAccountPage());
}

describe("application LINE account page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.actor.mockResolvedValue({ userId: "user-1", roles: ["PATIENT"], hospitalMemberships: [] });
    mocks.summary.mockResolvedValue({ status: "UNLINKED", reachability: null, reachabilityObservedAt: null });
    mocks.recoveryAvailable.mockReturnValue(true);
    mocks.soleOwnerCount.mockResolvedValue(0);
  });

  it("shows the dismissible LINE recovery nudge for an unlinked non-ADMIN account", async () => {
    const html = await renderPage();

    expect(html).toContain("ผูก LINE เพื่อรีเซ็ตรหัสผ่านเองได้เมื่อลืม");
    expect(html).toContain('data-user-id="user-1"');
    expect(html).toContain('href="/line/account"');
  });

  it("hides the nudge when the account is linked or the user is an ADMIN", async () => {
    mocks.summary.mockResolvedValue({ status: "LINKED" });
    expect(await renderPage()).not.toContain("ผูก LINE เพื่อรีเซ็ตรหัสผ่านเองได้เมื่อลืม");

    mocks.summary.mockResolvedValue({ status: "UNLINKED" });
    mocks.actor.mockResolvedValue({ userId: "admin-1", roles: ["ADMIN"], hospitalMemberships: [] });
    expect(await renderPage()).not.toContain("ผูก LINE เพื่อรีเซ็ตรหัสผ่านเองได้เมื่อลืม");
  });

  it("hides the recovery nudge when the LINE recovery request configuration is unavailable", async () => {
    mocks.recoveryAvailable.mockReturnValue(false);

    expect(await renderPage()).not.toContain("ผูก LINE เพื่อรีเซ็ตรหัสผ่านเองได้เมื่อลืม");
  });

  it("shows recovery readiness only for an active Hospital OWNER and includes the safe sole-owner count", async () => {
    const observedAt = new Date();
    const owner = {
      userId: "owner-1",
      roles: ["HOSPITAL"],
      hospitalMemberships: [{ hospitalId: "hospital-1", membershipType: "OWNER", status: "ACTIVE", hospitalStatus: "ACTIVE" }],
    };
    mocks.actor.mockResolvedValue(owner);
    mocks.summary.mockResolvedValue({ status: "LINKED", reachability: "FRIEND", reachabilityObservedAt: observedAt });
    mocks.soleOwnerCount.mockResolvedValue(1);

    const html = await renderPage();

    expect(html).toContain('data-readiness="READY"');
    expect(html).toContain('data-sole-owner-count="1"');
    expect(html).toContain('data-user-id="owner-1"');
    expect(mocks.soleOwnerCount).toHaveBeenCalledWith(owner);
    expect(html).not.toContain("ผูก LINE เพื่อรีเซ็ตรหัสผ่านเองได้เมื่อลืม");
  });

  it("does not show OWNER recovery readiness to a Hospital member", async () => {
    mocks.actor.mockResolvedValue({
      userId: "member-1",
      roles: ["HOSPITAL"],
      hospitalMemberships: [{ hospitalId: "hospital-1", membershipType: "MEMBER", status: "ACTIVE", hospitalStatus: "ACTIVE" }],
    });

    expect(await renderPage()).not.toContain("คำแนะนำเจ้าของโรงพยาบาล");
    expect(mocks.soleOwnerCount).not.toHaveBeenCalled();
  });

  it("does not show LINE recovery readiness to a Platform ADMIN with a Hospital OWNER membership", async () => {
    mocks.actor.mockResolvedValue({
      userId: "admin-owner-1",
      roles: ["ADMIN", "HOSPITAL"],
      hospitalMemberships: [{ hospitalId: "hospital-1", membershipType: "OWNER", status: "ACTIVE", hospitalStatus: "ACTIVE" }],
    });

    expect(await renderPage()).not.toContain("คำแนะนำเจ้าของโรงพยาบาล");
    expect(mocks.soleOwnerCount).not.toHaveBeenCalled();
  });
});
