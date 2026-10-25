import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  actor: vi.fn(),
  summary: vi.fn(),
  recoveryAvailable: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { ...props, href }, children),
}));
vi.mock("@/components/ui/page-header", () => ({ PageHeader: ({ title }: { title: string }) => createElement("h1", null, title) }));
vi.mock("@/components/ui/panel", () => ({ Panel: ({ children }: { children: ReactNode }) => createElement("section", null, children) }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("@/modules/line/services/line-account-service", () => ({ getLineAccountSummary: mocks.summary }));
vi.mock("@/modules/line/services/line-password-recovery-configuration", () => ({
  isLinePasswordRecoveryRequestConfigured: mocks.recoveryAvailable,
}));
vi.mock("../../../line/account/line-password-recovery-nudge", () => ({
  LinePasswordRecoveryNudge: ({ userId, href }: { userId: string; href: string }) =>
    createElement("aside", { "data-user-id": userId }, createElement("a", { href }, "ผูก LINE เพื่อรีเซ็ตรหัสผ่านเองได้เมื่อลืม")),
}));

import ApplicationLineAccountPage from "./page";

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await ApplicationLineAccountPage());
}

describe("application LINE account page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.actor.mockResolvedValue({ userId: "user-1", roles: ["PATIENT"] });
    mocks.summary.mockResolvedValue({ status: "UNLINKED" });
    mocks.recoveryAvailable.mockReturnValue(true);
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
    mocks.actor.mockResolvedValue({ userId: "admin-1", roles: ["ADMIN"] });
    expect(await renderPage()).not.toContain("ผูก LINE เพื่อรีเซ็ตรหัสผ่านเองได้เมื่อลืม");
  });

  it("hides the recovery nudge when the LINE recovery request configuration is unavailable", async () => {
    mocks.recoveryAvailable.mockReturnValue(false);

    expect(await renderPage()).not.toContain("ผูก LINE เพื่อรีเซ็ตรหัสผ่านเองได้เมื่อลืม");
  });
});
