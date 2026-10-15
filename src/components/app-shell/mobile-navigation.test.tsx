// @vitest-environment jsdom

import { act, Component, createElement, Suspense, use, useEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type Route = { href: string; ready?: Promise<void> };

const router = vi.hoisted(() => ({
  navigate: null as ((href: string) => void) | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push: (href: string) => router.navigate?.(href) }),
}));
vi.mock("next/link", () => ({
  // Mirrors Link: onNavigate runs for client-side navigations and may cancel the default one.
  default: ({ href, onNavigate, prefetch, ...props }: {
    href: string;
    onNavigate?: (event: { preventDefault: () => void }) => void;
    prefetch?: boolean;
  }) =>
    createElement("a", {
      ...props,
      "data-prefetch": String(prefetch),
      href,
      onClick: (event: MouseEvent) => {
        event.preventDefault();
        onNavigate?.({ preventDefault: () => undefined });
      },
    }),
  useLinkStatus: () => ({ pending: false }),
}));

import { MobileNavigation } from "./mobile-navigation";

const navigation = [
  { label: "งาน", workspace: "work" as const, items: [{ href: "/app/patients", label: "รายชื่อผู้ป่วย", match: "prefix" as const }] },
];

/** Stand-in for the App Router: a navigation is a transition that suspends until the page is ready. */
function RouterDouble(): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ href: "/app" });
  useEffect(() => {
    router.navigate = (href) => setRoute({ href, ready: pendingPages.get(href) });
    return () => {
      router.navigate = null;
    };
  }, []);

  return createElement(
    "div",
    null,
    createElement(MobileNavigation, { navigation }),
    createElement(
      PageErrorBoundary,
      null,
      createElement(Suspense, { fallback: null }, createElement(Page, { route })),
    ),
  );
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? createElement("p", { role: "alert" }, "โหลดหน้าไม่สำเร็จ") : this.props.children;
  }
}

function Page({ route }: { route: Route }): React.JSX.Element {
  if (route.ready) use(route.ready);
  return createElement("main", { id: "application-main-content", tabIndex: -1 }, route.href);
}

const pendingPages = new Map<string, Promise<void>>();
let container: HTMLDivElement;
let root: Root;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalMatchMedia: typeof window.matchMedia;

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
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
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
});

function mount(): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(RouterDouble)));
}

function trigger(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>('[aria-controls="mobile-application-navigation"]')!;
}

function status(): HTMLElement {
  return container.querySelector<HTMLElement>('[role="status"]')!;
}

async function openDrawerAndFollow(label: string): Promise<void> {
  act(() => trigger().click());
  const link = Array.from(container.querySelectorAll("dialog a")).find((anchor) => anchor.textContent?.includes(label));
  if (!link) throw new Error(`Missing drawer link: ${label}`);
  await act(async () => {
    (link as HTMLAnchorElement).click();
  });
}

describe("Mobile navigation pending feedback", () => {
  it("keeps the pending status visible after the drawer closes and clears it once the page renders", async () => {
    let finish: () => void = () => undefined;
    pendingPages.set("/app/patients", new Promise<void>((resolve) => {
      finish = resolve;
    }));
    mount();

    await openDrawerAndFollow("รายชื่อผู้ป่วย");

    expect(container.querySelector("dialog")).toBeNull();
    expect(status().textContent).toBe("กำลังเปิดหน้า");
    expect(trigger().getAttribute("aria-busy")).toBe("true");
    expect(trigger().disabled).toBe(false);
    expect(container.querySelector("main")?.textContent).toBe("/app");

    await act(async () => {
      finish();
    });

    expect(container.querySelector("main")?.textContent).toBe("/app/patients");
    expect(status().textContent).toBe("");
    expect(trigger().hasAttribute("aria-busy")).toBe(false);
  });

  it("keeps the status region mounted before navigation so the announcement is not missed", () => {
    mount();

    expect(status()).not.toBeNull();
    expect(status().textContent).toBe("");
  });

  it("moves focus to the main content after following a drawer link", async () => {
    mount();
    trigger().focus();

    await openDrawerAndFollow("รายชื่อผู้ป่วย");

    expect(document.activeElement?.id).toBe("application-main-content");
  });

  it("clears the pending status when the destination fails to load", async () => {
    let fail: (error: Error) => void = () => undefined;
    pendingPages.set("/app/patients", new Promise<void>((_resolve, reject) => {
      fail = reject;
    }));
    mount();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await openDrawerAndFollow("รายชื่อผู้ป่วย");
    expect(status().textContent).toBe("กำลังเปิดหน้า");

    await act(async () => {
      fail(new Error("server render failed"));
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("โหลดหน้าไม่สำเร็จ");
    expect(status().textContent).toBe("");
    expect(trigger().hasAttribute("aria-busy")).toBe(false);
    consoleError.mockRestore();
  });
});
