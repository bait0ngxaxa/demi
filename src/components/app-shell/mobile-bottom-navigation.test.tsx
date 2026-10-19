// @vitest-environment jsdom

import {
  act,
  Component,
  createElement,
  Suspense,
  use,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const routerState = vi.hoisted(() => ({
  currentHref: "/app/patients/assigned?task=screening",
  pendingAction: false,
  unknownOutcome: false,
  navigate: null as ((href: string) => void) | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => routerState.currentHref.split("?")[0],
  useSearchParams: () => new URLSearchParams(routerState.currentHref.split("?")[1] ?? ""),
  useRouter: () => ({
    push: (href: string) => routerState.navigate?.(href),
  }),
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
        if (onNavigate) {
          let navigationPrevented = false;
          onNavigate({
            preventDefault: () => {
              navigationPrevented = true;
            },
          });
          if (!navigationPrevented) {
            routerState.navigate?.(href);
          }
        } else {
          routerState.navigate?.(href);
        }
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
  {
    label: "พื้นที่ใช้งาน",
    workspace: "all",
    items: [
      { href: "/app/personal", label: "ส่วนตัว", match: "prefix", workspaceContext: "personal" },
      { href: "/app", label: "งาน", match: "exact", workspaceContext: "work" },
    ],
  },
  {
    label: "ส่วนตัว",
    workspace: "personal",
    items: [
      { href: "/app/personal", label: "หน้าส่วนตัว", match: "exact" },
      { href: "/app/personal/appointments", label: "นัดหมาย", match: "prefix" },
      { href: "/app/personal/wellness", label: "สุขภาพ", match: "prefix" },
      { href: "/app/personal/care", label: "การดูแล", match: "prefix" },
    ],
  },
  { label: null, workspace: "work", items: [{ href: "/app", label: "หน้าหลัก", match: "exact" }] },
  {
    label: "ผู้ป่วย",
    workspace: "work",
    items: [
      { href: "/app/patients/assigned", label: "ผู้ป่วยที่รับผิดชอบ", match: "exact" },
      { href: "/app/patients/provision", label: "เพิ่มหรือนำเข้าผู้ป่วย", match: "prefix" },
    ],
  },
  {
    label: "บัญชีและช่วยเหลือ",
    workspace: "all",
    items: [
      { href: "/app/family", label: "ญาติและผู้ดูแล", match: "prefix" },
      { href: "/app/settings", label: "ตั้งค่า", match: "prefix" },
    ],
  },
];
const projection = projectMobileNavigation(navigation);
const pendingPages = new Map<string, Promise<void>>();
let container: HTMLDivElement;
let root: Root;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalMatchMedia: typeof window.matchMedia;
let desktopMatches = false;
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();

function Page({ href }: { href: string }): React.JSX.Element {
  const pending = pendingPages.get(href);
  if (pending) use(pending);
  return (
    <main id="application-main-content" tabIndex={-1}>
      {href}
      {routerState.pendingAction ? (
        <form>
          <button aria-busy="true" disabled type="submit">กำลังบันทึก</button>
        </form>
      ) : null}
      {routerState.unknownOutcome ? (
        <div data-navigation-guard="unknown-outcome">ต้องตรวจสอบผลก่อนออกจากหน้านี้</div>
      ) : null}
    </main>
  );
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed
      ? <main id="application-main-content" role="alert">โหลดหน้าไม่สำเร็จ</main>
      : this.props.children;
  }
}

function RouterHarness(): React.JSX.Element {
  const [href, setHref] = useState(routerState.currentHref);

  useEffect(() => {
    routerState.navigate = (nextHref) => {
      routerState.currentHref = nextHref;
      setHref(nextHref);
    };

    return () => {
      routerState.navigate = null;
    };
  }, []);

  return (
    <NavigationWorkspaceProvider availableWorkspaces={projection.availableWorkspaces}>
      <MobileWorkspaceLabel />
      <MobileBottomNavigation navigation={navigation} projection={projection} />
      <PageErrorBoundary>
        <Suspense fallback={<main id="application-main-content" tabIndex={-1}>กำลังโหลดหน้า</main>}>
          <Page href={href} />
        </Suspense>
      </PageErrorBoundary>
    </NavigationWorkspaceProvider>
  );
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  originalMatchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: desktopMatches,
    media: query,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaListeners.delete(listener);
    },
  })) as unknown as typeof window.matchMedia;
});

afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  window.matchMedia = originalMatchMedia;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  pendingPages.clear();
  desktopMatches = false;
  routerState.pendingAction = false;
  routerState.unknownOutcome = false;
  mediaListeners.clear();
  routerState.navigate = null;
  vi.restoreAllMocks();
});

function mount(initialHref = "/app/patients/assigned?task=screening"): void {
  routerState.currentHref = initialHref;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(RouterHarness)));
}

function moreTrigger(): HTMLButtonElement {
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="เพิ่มเติม"]');
  if (!trigger) throw new Error("Missing More navigation button");
  return trigger;
}

function dialog(): HTMLDialogElement {
  const element = container.querySelector<HTMLDialogElement>("dialog");
  if (!element) throw new Error("Missing More navigation dialog");
  return element;
}

function navigate(href: string): void {
  act(() => routerState.navigate?.(href));
}

describe("unified mobile bottom navigation", () => {
  it("keeps the Patient workspace selected when opening a shared family route", () => {
    mount("/app/personal/appointments");

    expect(container.querySelector('[aria-label="นัดหมาย"]')).not.toBeNull();
    act(() => moreTrigger().click());

    const familyLink = dialog().querySelector<HTMLAnchorElement>('a[href="/app/family"]');
    if (!familyLink) throw new Error("Missing shared family destination in More");
    act(() => familyLink.click());

    expect(routerState.currentHref).toBe("/app/family");
    expect(container.querySelector('[aria-label="นัดหมาย"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="คัดกรองผู้ป่วย"]')).toBeNull();
    expect(container.textContent).toContain("พื้นที่ส่วนตัว");
    act(() => moreTrigger().click());
    expect(dialog().getAttribute("aria-label")).toBe("เมนูเพิ่มเติม · พื้นที่ส่วนตัว");

    navigate("/app/patients/assigned");
    expect(container.querySelector('[aria-label="ผู้ป่วยที่รับผิดชอบ"]')).not.toBeNull();
    expect(container.textContent).toContain("พื้นที่งาน");

    navigate("/app/settings");
    expect(container.querySelector('[aria-label="ผู้ป่วยที่รับผิดชอบ"]')).not.toBeNull();
    expect(container.textContent).toContain("พื้นที่งาน");
  });

  it("defaults a direct shared-route URL to Work when both workspaces are available", () => {
    mount("/app/family");

    expect(container.querySelector('[aria-label="คัดกรองผู้ป่วย"]')).not.toBeNull();
    expect(container.textContent).toContain("พื้นที่งาน");
  });

  it("keeps query task selection current across route and history changes", () => {
    mount();

    expect(container.querySelector('[aria-label="คัดกรองผู้ป่วย"]')?.getAttribute("aria-current")).toBe("page");
    const followup = container.querySelector<HTMLAnchorElement>('[aria-label="ติดตามผู้ป่วย"]');
    expect(followup?.getAttribute("href")).toBe("/app/patients/assigned?task=followup");
    act(() => followup?.click());
    expect(container.querySelector('[aria-label="ติดตามผู้ป่วย"]')?.getAttribute("aria-current")).toBe("page");

    navigate("/app/patients/assigned?task=screening");
    expect(container.querySelector('[aria-label="คัดกรองผู้ป่วย"]')?.getAttribute("aria-current")).toBe("page");
    navigate("/app/patients/assigned");
    expect(container.querySelector('[aria-label="ผู้ป่วยที่รับผิดชอบ"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("opens More as an accessible dialog and traps keyboard focus", () => {
    mount();
    moreTrigger().focus();
    act(() => moreTrigger().click());

    expect(dialog().getAttribute("aria-label")).toBe("เมนูเพิ่มเติม · พื้นที่งาน");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement?.hasAttribute("data-drawer-close")).toBe(true);
    expect(dialog().querySelector('nav[aria-label="เมนูเพิ่มเติม"]')).not.toBeNull();

    const focusable = Array.from(
      dialog().querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) throw new Error("Missing focusable dialog controls");

    last.focus();
    const tabForward = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });
    document.dispatchEvent(tabForward);
    expect(tabForward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const tabBackward = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      shiftKey: true,
    });
    document.dispatchEvent(tabBackward);
    expect(tabBackward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it("closes on Escape and backdrop, restoring focus and body scrolling", () => {
    mount();
    moreTrigger().focus();
    act(() => moreTrigger().click());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));

    expect(container.querySelector("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(moreTrigger());

    act(() => moreTrigger().click());
    act(() => dialog().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(moreTrigger());
  });

  it("closes and moves focus to Main after route changes or crossing the desktop breakpoint", () => {
    mount();
    act(() => moreTrigger().click());
    navigate("/app/patients/provision");
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement?.id).toBe("application-main-content");

    act(() => moreTrigger().click());
    desktopMatches = true;
    act(() => {
      for (const listener of mediaListeners) {
        listener({ matches: true, media: "(min-width: 1024px)" } as MediaQueryListEvent);
      }
    });
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement?.id).toBe("application-main-content");
    expect(document.body.style.overflow).toBe("");
  });

  it("announces a pending secondary navigation and clears pending state after completion", async () => {
    let finish: () => void = () => undefined;
    pendingPages.set("/app/patients/provision", new Promise<void>((resolve) => { finish = resolve; }));
    mount();
    act(() => moreTrigger().click());

    const link = Array.from(dialog().querySelectorAll<HTMLAnchorElement>("a")).find(
      (anchor) => anchor.getAttribute("href") === "/app/patients/provision",
    );
    if (!link) throw new Error("Missing Patient provisioning link in More");
    await act(async () => link.click());

    expect(container.querySelector("dialog")).toBeNull();
    expect(moreTrigger().getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("กำลังเปิดหน้า");
    expect(document.activeElement?.id).toBe("application-main-content");

    await act(async () => finish());
    expect(moreTrigger().hasAttribute("aria-busy")).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
  });

  it("asks before navigating away from a pending form action and preserves the page when cancelled", () => {
    routerState.pendingAction = true;
    mount();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    const followup = container.querySelector<HTMLAnchorElement>('[aria-label="ติดตามผู้ป่วย"]');
    act(() => followup?.click());

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("มีรายการกำลังดำเนินการอยู่"));
    expect(routerState.currentHref).toBe("/app/patients/assigned?task=screening");
    expect(container.querySelector('[aria-label="คัดกรองผู้ป่วย"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("allows navigation when the user confirms leaving a pending action", () => {
    routerState.pendingAction = true;
    mount();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    const followup = container.querySelector<HTMLAnchorElement>('[aria-label="ติดตามผู้ป่วย"]');
    act(() => followup?.click());

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(routerState.currentHref).toBe("/app/patients/assigned?task=followup");
    expect(container.querySelector('[aria-label="ติดตามผู้ป่วย"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("keeps More open when navigation from an unknown outcome is cancelled", () => {
    routerState.unknownOutcome = true;
    mount();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => moreTrigger().click());

    const provisioning = dialog().querySelector<HTMLAnchorElement>('a[href="/app/patients/provision"]');
    if (!provisioning) throw new Error("Missing Patient provisioning link in More");
    act(() => provisioning.click());

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("ระบบยังยืนยันผลการบันทึกไม่ได้"));
    expect(dialog()).toBeTruthy();
    expect(routerState.currentHref).toBe("/app/patients/assigned?task=screening");
    expect(container.querySelector('[data-navigation-guard="unknown-outcome"]')?.textContent).toBe("ต้องตรวจสอบผลก่อนออกจากหน้านี้");
  });

  it("asks before leaving an active unknown outcome through a bottom tab and preserves route and state when cancelled", () => {
    routerState.unknownOutcome = true;
    mount("/app/personal/wellness");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    const appointments = container.querySelector<HTMLAnchorElement>('[aria-label="นัดหมาย"]');
    act(() => appointments?.click());

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("ระบบยังยืนยันผลการบันทึกไม่ได้"));
    expect(routerState.currentHref).toBe("/app/personal/wellness");
    expect(container.querySelector('[aria-label="สุขภาพ"]')?.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector('[data-navigation-guard="unknown-outcome"]')?.textContent).toBe("ต้องตรวจสอบผลก่อนออกจากหน้านี้");
  });
});
