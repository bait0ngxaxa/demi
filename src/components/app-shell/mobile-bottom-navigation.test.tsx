// @vitest-environment jsdom

import { act, createElement, useEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const routerState = vi.hoisted(() => ({
  currentHref: "/app/patients/assigned?task=screening",
  pendingAction: false,
  unknownOutcome: false,
  history: [] as string[],
  historyIndex: 0,
  navigate: null as ((href: string) => void) | null,
  back: null as (() => void) | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => routerState.currentHref.split("?")[0],
  useSearchParams: () => new URLSearchParams(routerState.currentHref.split("?")[1] ?? ""),
  useRouter: () => ({ push: (href: string) => routerState.navigate?.(href) }),
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
      "data-prefetch": prefetch === false ? "false" : "true",
      onClick: (event: MouseEvent) => {
        event.preventDefault();
        let navigationPrevented = false;
        onNavigate?.({ preventDefault: () => { navigationPrevented = true; } });
        if (!navigationPrevented) routerState.navigate?.(href);
      },
    });
  },
  useLinkStatus: () => ({ pending: false }),
}));

import { MobileBottomNavigation } from "./mobile-bottom-navigation";
import { MobileWorkspaceLabel } from "./mobile-workspace-label";
import { NavigationWorkspaceProvider } from "./navigation-workspace-provider";
import { projectMobileNavigation } from "./mobile-tab-projection";
import type { ApplicationNavigationGroup } from "./navigation-types";

const navigation: readonly ApplicationNavigationGroup[] = [
  { id: "home", label: null, workspace: "personal", items: [{ href: "/app/personal", label: "หน้าส่วนตัว", match: "exact" }] },
  {
    id: "care",
    label: "การดูแลของฉัน",
    workspace: "personal",
    items: [
      { href: "/app/personal/appointments", label: "นัดหมาย", match: "prefix" },
      { href: "/app/personal/wellness", label: "อาหารและออกกำลังกาย", match: "prefix" },
      { href: "/app/personal/care", label: "ข้อมูลการดูแล", match: "prefix" },
    ],
  },
  { id: "home", label: null, workspace: "work", items: [{ href: "/app", label: "หน้าหลัก", match: "exact" }] },
  {
    id: "care",
    label: "ดูแลผู้ป่วย",
    workspace: "work",
    items: [
      { href: "/app/patients/assigned", label: "ผู้ป่วยที่ดูแล", match: "exact" },
      { href: "/app/patients/provision", label: "เพิ่มผู้ป่วย", match: "prefix" },
    ],
  },
  {
    id: "account",
    label: "บัญชีและช่วยเหลือ",
    workspace: "all",
    items: [
      { href: "/app/family", label: "ครอบครัวและผู้ดูแล", match: "prefix" },
      { href: "/app/settings", label: "ตั้งค่า", match: "prefix" },
      { href: "/app/support", label: "แจ้งปัญหาการใช้งาน", match: "prefix" },
    ],
  },
];
const projection = projectMobileNavigation(navigation);
let container: HTMLDivElement;
let root: Root;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalScrollTo: PropertyDescriptor | undefined;

function RouterHarness(): React.JSX.Element {
  const [, setCurrentHref] = useState(routerState.currentHref);

  useEffect(() => {
    routerState.navigate = (href) => {
      routerState.history = routerState.history.slice(0, routerState.historyIndex + 1);
      routerState.history.push(href);
      routerState.historyIndex += 1;
      routerState.currentHref = href;
      setCurrentHref(href);
    };
    routerState.back = () => {
      if (routerState.historyIndex === 0) return;

      routerState.historyIndex -= 1;
      const href = routerState.history[routerState.historyIndex];
      if (!href) return;

      routerState.currentHref = href;
      setCurrentHref(href);
    };

    return () => {
      routerState.navigate = null;
      routerState.back = null;
    };
  }, []);

  return (
    <NavigationWorkspaceProvider availableWorkspaces={projection.availableWorkspaces}>
      <MobileWorkspaceLabel />
      <MobileBottomNavigation projection={projection} />
      <main id="application-main-content" tabIndex={-1}>
        {routerState.currentHref}
        {routerState.pendingAction ? (
          <button aria-busy="true" disabled type="button">กำลังบันทึก</button>
        ) : null}
        {routerState.unknownOutcome ? (
          <div data-navigation-guard="unknown-outcome">ต้องตรวจสอบผลก่อนออกจากหน้านี้</div>
        ) : null}
      </main>
    </NavigationWorkspaceProvider>
  );
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value(): void {} });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});

afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  routerState.pendingAction = false;
  routerState.unknownOutcome = false;
  routerState.history = [];
  routerState.historyIndex = 0;
  routerState.navigate = null;
  routerState.back = null;
  vi.restoreAllMocks();
});

function mount(initialHref = "/app/patients/assigned?task=screening"): void {
  routerState.currentHref = initialHref;
  routerState.history = [initialHref];
  routerState.historyIndex = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(RouterHarness)));
}

function moreLink(): HTMLAnchorElement {
  const link = container.querySelector<HTMLAnchorElement>('a[aria-label="เปิดเมนูเพิ่มเติม"]');
  if (!link) throw new Error("Missing More navigation link");
  return link;
}

function navigate(href: string): void {
  act(() => routerState.navigate?.(href));
}

function goBack(): void {
  act(() => routerState.back?.());
}

function dialogButton(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("dialog button"))
    .find((item) => item.textContent?.includes(label));
  if (!button) throw new Error(`Missing dialog button: ${label}`);
  return button;
}

describe("unified mobile bottom navigation", () => {
  it("uses a More history entry and browser back restores the previous page and workspace", () => {
    mount("/app/personal/appointments");

    expect(moreLink().tagName).toBe("A");
    expect(moreLink().getAttribute("href")).toBe("/app/more?workspace=personal");
    expect(moreLink().getAttribute("data-prefetch")).toBe("false");
    expect(moreLink().hasAttribute("aria-current")).toBe(false);
    expect(container.textContent).toContain("พื้นที่ส่วนตัว");

    act(() => moreLink().click());
    expect(routerState.currentHref).toBe("/app/more?workspace=personal");
    expect(moreLink().getAttribute("aria-current")).toBe("page");
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.textContent).toContain("พื้นที่ส่วนตัว");

    goBack();
    expect(routerState.currentHref).toBe("/app/personal/appointments");
    expect(container.querySelector('[aria-label="นัดหมาย"]')?.getAttribute("aria-current")).toBe("page");
    expect(container.textContent).toContain("พื้นที่ส่วนตัว");
  });

  it("marks More active only on its route and reads a direct workspace query", () => {
    mount("/app/more?workspace=personal");

    expect(moreLink().getAttribute("aria-current")).toBe("page");
    expect(container.querySelector('[aria-label="นัดหมาย"]')?.getAttribute("aria-current")).toBeNull();
    expect(container.textContent).toContain("พื้นที่ส่วนตัว");

    navigate("/app/family");
    expect(moreLink().hasAttribute("aria-current")).toBe(false);
  });

  it("asks before navigating from More when a pending action is active", () => {
    routerState.pendingAction = true;
    mount("/app/patients/assigned?task=screening");

    act(() => moreLink().click());

    expect(container.querySelector("dialog")?.textContent).toContain("มีรายการกำลังดำเนินการอยู่");
    expect(routerState.currentHref).toBe("/app/patients/assigned?task=screening");
    expect(moreLink().getAttribute("aria-current")).toBeNull();
    act(() => dialogButton("อยู่หน้านี้").click());
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("allows the More link after the user confirms leaving a pending action", () => {
    routerState.pendingAction = true;
    mount("/app/patients/assigned?task=screening");

    act(() => moreLink().click());
    act(() => dialogButton("เปลี่ยนหน้า").click());

    expect(routerState.currentHref).toBe("/app/more?workspace=work");
    expect(moreLink().getAttribute("aria-current")).toBe("page");
  });

  it("keeps task tabs active as query navigation changes", () => {
    mount();

    expect(container.querySelector('[aria-label="คัดกรองผู้ป่วย"]')?.getAttribute("aria-current")).toBe("page");
    // CT-3: the former follow-up task tab is gone (its URL redirects to /app/services).
    expect(container.querySelector('[aria-label="ติดตามผู้ป่วย"]')).toBeNull();
    const assigned = container.querySelector<HTMLAnchorElement>('[aria-label="ผู้ป่วยที่ดูแล"]');
    act(() => assigned?.click());
    expect(container.querySelector('[aria-label="ผู้ป่วยที่ดูแล"]')?.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector('[aria-label="คัดกรองผู้ป่วย"]')?.getAttribute("aria-current")).toBeNull();

    navigate("/app/patients/assigned?task=screening");
    expect(container.querySelector('[aria-label="คัดกรองผู้ป่วย"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("asks before changing tabs when an unresolved outcome is active", () => {
    routerState.unknownOutcome = true;
    mount("/app/personal/wellness");

    const appointments = container.querySelector<HTMLAnchorElement>('[aria-label="นัดหมาย"]');
    act(() => appointments?.click());

    expect(container.querySelector("dialog")?.textContent).toContain("ระบบยังยืนยันผลการบันทึกไม่ได้");
    expect(routerState.currentHref).toBe("/app/personal/wellness");
    expect(container.querySelector('[aria-label="สุขภาพ"]')?.getAttribute("aria-current")).toBe("page");
  });
});
