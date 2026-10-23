import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

const dependencies = vi.hoisted(() => ({
  actor: vi.fn(),
  displayName: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
  usePathname: () => "/app/more",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) =>
    createElement("a", { ...props, href, "data-prefetch": String(prefetch) }, children),
}));
vi.mock("@/modules/auth/services/actor-workspace-service", () => ({
  listActorHospitalWorkspaces: () => Promise.resolve([]),
}));
vi.mock("@/modules/appointments/services/work-appointment-query-service", () => ({
  countWorkAppointmentsAwaitingMyAcceptance: () => Promise.resolve(0),
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: () => dependencies.actor(),
}));
vi.mock("@/modules/auth/services/actor-display-name-service", () => ({
  getActorDisplayName: (actor: ActorContext) => dependencies.displayName(actor),
}));
vi.mock("@/components/app-shell/logout-button", () => ({
  LogoutButton: ({ fullWidth }: { fullWidth?: boolean }) =>
    createElement("button", { "data-full-width": fullWidth ? "true" : "false" }, "ออกจากระบบ"),
}));

import MorePage from "./page";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function actor(roles: readonly Role[]): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles,
    hospitalMemberships: roles.includes(Role.HOSPITAL)
      ? [{
          hospitalId,
          membershipType: MembershipType.OWNER,
          profession: Profession.NURSE,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        }]
      : [],
    osmHospitalRelationships: roles.includes(Role.OSM)
      ? [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }]
      : [],
  };
}

async function renderPage(
  currentActor: ActorContext,
  workspace?: string | string[],
): Promise<string> {
  dependencies.actor.mockResolvedValue(currentActor);
  dependencies.displayName.mockResolvedValue("สมชาย ใจดี");
  const page = await MorePage({ searchParams: Promise.resolve({ workspace }) });
  return renderToStaticMarkup(page);
}

describe("/app/more page", () => {
  beforeEach(() => {
    dependencies.actor.mockReset();
    dependencies.displayName.mockReset();
  });

  it("renders the profile, role labels, projected work menu, and full-width logout", async () => {
    const html = await renderPage(actor([Role.OSM]), "personal");

    expect(html).toContain("สมชาย ใจดี");
    expect(html).toContain("อสม.");
    expect(html).toContain('data-full-width="true"');
    // ADR-0019: OSM work menus never offer patient import; the work menu is still projected.
    expect(html).toContain('href="/app/hospitals/content"');
    expect(html).not.toContain("/app/patients/provision");
    expect(dependencies.actor).toHaveBeenCalledTimes(1);
    expect(dependencies.displayName).toHaveBeenCalledWith(expect.objectContaining({ personId: "33333333-3333-4333-8333-333333333333" }));
  });

  it("validates the selected workspace against the actor's available workspaces", async () => {
    const html = await renderPage(actor([Role.PATIENT, Role.OSM]), "personal");

    // UI-4: the workspace switch is a segmented control that keeps the viewer on More.
    expect(html).toContain('href="/app/more?workspace=personal"');
    expect(html).toContain('href="/app/more?workspace=work"');
    expect(html).toContain("href=\"/app/personal/profile\"");
    expect(html).not.toContain('href="/app/hospitals/content"');
  });

  it("rejects duplicate workspace query values and defaults dual-workspace actors to Work", async () => {
    const html = await renderPage(actor([Role.PATIENT, Role.OSM]), ["personal", "work"]);

    expect(html).toContain('href="/app/more?workspace=personal"');
    expect(html).toContain('href="/app/hospitals/content"');
    expect(html).not.toContain('href="/app/personal/profile"');
  });
});
