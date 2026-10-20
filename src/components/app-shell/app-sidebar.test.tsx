// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, onNavigate, ...props }: { href: string; children?: ReactNode; prefetch?: boolean; onNavigate?: unknown }) => {
    void prefetch;
    void onNavigate;
    return createElement("a", { ...props, href }, children);
  },
  useLinkStatus: () => ({ pending: false }),
}));
vi.mock("./logout-button", () => ({
  LogoutButton: ({ iconOnly }: { iconOnly?: boolean }) =>
    createElement("button", { "aria-label": "ออกจากระบบ", "data-icon-only": String(Boolean(iconOnly)), "data-navigation-tooltip": "ออกจากระบบ", type: "submit" }, iconOnly ? null : "ออกจากระบบ"),
}));

import { AppSidebar } from "./app-sidebar";
import { DESKTOP_SIDEBAR_STORAGE_KEY } from "./desktop-sidebar-state";
import type { ApplicationNavigationGroup } from "./navigation-types";

const navigation: ApplicationNavigationGroup[] = [
  { id: "home", label: null, workspace: "work", items: [{ href: "/app", label: "หน้าหลัก", match: "exact" }] },
  { id: "care", label: "ดูแลผู้ป่วย", workspace: "work", items: [
    { href: "/app/patients", label: "รายชื่อผู้ป่วย", match: "exact" },
    { href: "/app/patients/assign-osm", label: "มอบหมาย อสม.", match: "prefix" },
  ] },
  { id: "account", label: "บัญชีและช่วยเหลือ", workspace: "work", items: [{ href: "/app/settings", label: "ตั้งค่า", match: "prefix" }] },
  { id: "home", label: null, workspace: "personal", items: [{ href: "/app/personal", label: "หน้าส่วนตัว", match: "exact" }] },
];

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // The stored preference is read once per page load; this suite exercises the collapsed icon rail.
  window.localStorage.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, "collapsed");
});

afterEach(() => {
  const mountedRoot = root;
  if (mountedRoot) act(() => mountedRoot.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function renderSidebar(): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  const mountedRoot = createRoot(container);
  root = mountedRoot;
  act(() => mountedRoot.render(createElement(AppSidebar, {
    availableWorkspaces: ["personal", "work"],
    displayName: "สมชาย ใจดี",
    navigation,
    roleLabels: ["เจ้าของโรงพยาบาล"],
  })));
  return container;
}

describe("collapsed desktop sidebar icon rail", () => {
  it("keeps the stored preference and every item keyboard-reachable with an accessible name", () => {
    const sidebar = renderSidebar();
    const aside = sidebar.querySelector("aside");
    const links = [...sidebar.querySelectorAll<HTMLAnchorElement>("#desktop-application-navigation a")];

    expect(aside?.dataset.state).toBe("collapsed");
    expect(sidebar.querySelector("[inert]")).toBeNull();
    expect(sidebar.querySelector("#desktop-application-navigation")?.getAttribute("aria-hidden")).toBeNull();
    // UI-4.1: account items are the last section of the single scrolling nav.
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(["หน้าหลัก", "รายชื่อผู้ป่วย", "มอบหมาย อสม.", "ตั้งค่า"]);
    for (const link of links) {
      expect(link.tabIndex).toBe(0);
      link.focus();
      expect(document.activeElement).toBe(link);
    }
    // Section headings are hidden visually but still label their lists.
    expect(sidebar.querySelector("#navigation-section-desktop-care")?.className).toContain("sr-only");
    // The pinned identity row keeps only the avatar and logout icon in the rail; the name stays for screen readers.
    expect(sidebar.querySelectorAll("nav").length).toBe(2);
    expect(sidebar.querySelector('[data-icon-only="true"]')).not.toBeNull();
    expect(sidebar.querySelector(".rounded-full")?.textContent).toBe("ส");
    expect([...sidebar.querySelectorAll(".sr-only")].map(({ textContent }) => textContent)).toContain("สมชาย ใจดี · เจ้าของโรงพยาบาล");
    expect([...sidebar.querySelectorAll("p")].some(({ textContent }) => textContent === "สมชาย ใจดี")).toBe(false);
    // The workspace switch is a segmented control above the sections, not a section.
    expect([...sidebar.querySelectorAll('nav[aria-label="พื้นที่ใช้งาน"] a')].map((link) => link.getAttribute("href"))).toEqual(["/app/personal", "/app"]);
  });

  it("shows a non-focusable tooltip on focus and hover, and hides it on blur and Escape", () => {
    const sidebar = renderSidebar();
    const link = sidebar.querySelector<HTMLAnchorElement>('a[href="/app/patients/assign-osm"]');
    if (!link) throw new Error("Missing rail item");
    const tooltip = (): HTMLElement | null => sidebar.querySelector<HTMLElement>(".pointer-events-none.fixed");

    act(() => link.focus());
    expect(tooltip()?.textContent).toBe("มอบหมาย อสม.");
    expect(tooltip()?.getAttribute("aria-hidden")).toBe("true");
    expect(tooltip()?.querySelector("a, button, [tabindex]")).toBeNull();
    // Focus stays on the link; the tooltip never takes it.
    expect(document.activeElement).toBe(link);

    act(() => {
      link.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(tooltip()).toBeNull();

    act(() => {
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(tooltip()?.textContent).toBe("มอบหมาย อสม.");
    act(() => link.blur());
    expect(tooltip()).toBeNull();
  });
});
