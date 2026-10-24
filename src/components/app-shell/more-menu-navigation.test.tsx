// @vitest-environment jsdom

import { MembershipStatus, MembershipType, Profession, Role, HospitalStatus } from "@prisma/client";
import { act, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const navigationState = vi.hoisted(() => ({
  pathname: "/app/more",
  navigatedHref: null as string | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    onNavigate,
    prefetch,
    ...props
  }: {
    href: string;
    onNavigate?: (event: { preventDefault: () => void }) => void;
    prefetch?: boolean;
    children?: ReactNode;
  }) => {
    void prefetch;
    return createElement("a", {
      ...props,
      href,
      onClick: (event: MouseEvent) => {
        event.preventDefault();
        let prevented = false;
        onNavigate?.({ preventDefault: () => { prevented = true; } });
        if (!prevented) navigationState.navigatedHref = href;
      },
    });
  },
  useLinkStatus: () => ({ pending: false }),
}));

import { projectApplicationNavigation as projectNavigation } from "./application-navigation";
import { MobileNavigationGlyph, getMoreNavigationIcon } from "./mobile-navigation-glyph";
import { MoreMenuNavigation } from "./more-menu-navigation";
import { NavigationList } from "./navigation-list";
import { projectMobileNavigation, projectMoreNavigation } from "./mobile-tab-projection";
import type { ApplicationNavigationGroup, ApplicationWorkspaceContext } from "./navigation-types";
import type { ActorContext } from "@/modules/auth/types/actor-context";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function projectApplicationNavigation(subject: ActorContext): readonly ApplicationNavigationGroup[] {
  return projectNavigation(subject, []);
}

function actor(
  roles: readonly Role[],
  membershipType: MembershipType = MembershipType.OWNER,
): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles,
    hospitalMemberships: roles.includes(Role.HOSPITAL)
      ? [{
          hospitalId,
          membershipType,
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

const menuCases: readonly {
  label: string;
  roles: readonly Role[];
  workspace: ApplicationWorkspaceContext;
  membershipType?: MembershipType;
}[] = [
  { label: "Patient", roles: [Role.PATIENT], workspace: "personal" },
  { label: "OSM", roles: [Role.OSM], workspace: "work" },
  { label: "Hospital MEMBER", roles: [Role.HOSPITAL], workspace: "work", membershipType: MembershipType.MEMBER },
  { label: "Hospital OWNER", roles: [Role.HOSPITAL], workspace: "work", membershipType: MembershipType.OWNER },
  { label: "ADMIN", roles: [Role.ADMIN], workspace: "work" },
  { label: "dual personal workspace", roles: [Role.PATIENT, Role.OSM], workspace: "personal" },
  { label: "dual work workspace", roles: [Role.PATIENT, Role.OSM], workspace: "work" },
];

let container: HTMLDivElement | undefined;
let root: Root | undefined;

function renderNavigation(
  groups: readonly ApplicationNavigationGroup[],
  selectedWorkspace: ApplicationWorkspaceContext,
): string {
  return renderToStaticMarkup(createElement(MoreMenuNavigation, { groups, selectedWorkspace }));
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  const mountedRoot = root;
  if (mountedRoot) act(() => mountedRoot.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  navigationState.pathname = "/app/more";
  navigationState.navigatedHref = null;
  vi.restoreAllMocks();
});

describe("More menu page navigation", () => {
  it.each(menuCases)("renders exactly the projected menu for $label in $workspace", ({
    roles,
    workspace,
    membershipType,
  }) => {
    const projectedNavigation = projectApplicationNavigation(actor(roles, membershipType));
    const mobileProjection = projectMobileNavigation(projectedNavigation);
    const groups = projectMoreNavigation(projectedNavigation, mobileProjection.tabsByWorkspace[workspace]);
    const visibleGroups = groups.filter(({ workspace: groupWorkspace }) =>
      groupWorkspace === undefined || groupWorkspace === "all" || groupWorkspace === workspace,
    );
    const expectedHrefs = visibleGroups.flatMap(({ items }) => items.map(({ href }) => href));
    const html = renderNavigation(groups, workspace);
    const renderedHrefs = Array.from(html.matchAll(/href="([^"]+)"/g), (match) => match[1]);

    expect(mobileProjection.availableWorkspaces).toContain(workspace);
    expect(renderedHrefs).toEqual(expectedHrefs);
    expect(html.match(/<h2\b/g)).toHaveLength(visibleGroups.length);
    expect(html).toContain("min-h-12");
    expect(html.match(/<svg\b/g)).toHaveLength(expectedHrefs.length * 2);
    // UI-4: the workspace switch is a separate segmented control, never a More section.
    expect(html).not.toContain("พื้นที่ใช้งาน");
    expect(html).not.toContain('aria-current="location"');
  });

  it.each(menuCases)("shows $label sections in the same order as the desktop sidebar ($workspace)", ({
    roles,
    workspace,
    membershipType,
  }) => {
    const projectedNavigation = projectApplicationNavigation(actor(roles, membershipType));
    const groups = projectMoreNavigation(projectedNavigation, projectMobileNavigation(projectedNavigation).tabsByWorkspace[workspace]);
    const moreIds = Array.from(renderNavigation(groups, workspace).matchAll(/id="more-navigation-heading-([a-z-]+)"/g), (match) => match[1]);
    const sidebarIds = Array.from(
      renderToStaticMarkup(createElement(NavigationList, { availableContexts: [workspace], groups: projectedNavigation })).matchAll(/<ul aria-labelledby="navigation-section-desktop-([a-z-]+)"/g),
      (match) => match[1],
    );

    expect(moreIds.length).toBeGreaterThan(0);
    expect(sidebarIds.filter((id) => moreIds.includes(id))).toEqual(moreIds);
    expect(moreIds.at(-1)).toBe("account");
  });

  it("asks before leaving a guarded form from a More row and cancels when declined", () => {
    const projectedNavigation = projectApplicationNavigation(actor([Role.PATIENT]));
    const groups = projectMoreNavigation(
      projectedNavigation,
      projectMobileNavigation(projectedNavigation).tabsByWorkspace.personal,
    );
    container = document.createElement("div");
    document.body.append(container);
    const mountedRoot = createRoot(container);
    root = mountedRoot;

    act(() => mountedRoot.render(createElement("div", null,
      createElement("main", { id: "application-main-content" },
        createElement("button", { "aria-busy": "true", disabled: true }, "กำลังบันทึก"),
      ),
      createElement(MoreMenuNavigation, { groups, selectedWorkspace: "personal" }),
    )));

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const familyLink = container.querySelector<HTMLAnchorElement>('a[href="/app/family"]');
    if (!familyLink) throw new Error("Missing projected family destination");
    act(() => familyLink.click());

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("มีรายการกำลังดำเนินการอยู่"));
    expect(navigationState.navigatedHref).toBeNull();
  });

  it("uses local SVGs and a neutral glyph for unknown destinations", () => {
    expect(getMoreNavigationIcon("/app/unknown")).toBe("default");
    expect(getMoreNavigationIcon("/app/hospitals/reporting?scope=network")).toBe("areas");
    expect(getMoreNavigationIcon("/app/hospitals/reporting?hospitalId=hospital")).toBe("reports");
    expect(renderToStaticMarkup(createElement(MobileNavigationGlyph, { icon: "default" }))).toContain("<svg");
  });
});
