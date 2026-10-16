// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToasterProps } from "sonner";

const sonnerMock = vi.hoisted(() => ({
  rendered: [] as Array<{
    position: string | undefined;
    visibleToasts: number | undefined;
    closeButton: boolean | undefined;
    toastCloseButton: boolean | undefined;
    closeButtonAriaLabel: string | undefined;
    containerAriaLabel: string | undefined;
    mobileOffset: unknown;
    style: unknown;
  }>,
}));

vi.mock("sonner", async () => {
  const { createElement } = await import("react");
  return {
    Toaster: (props: ToasterProps) => {
      sonnerMock.rendered.push({
        position: props.position,
        visibleToasts: props.visibleToasts,
        closeButton: props.closeButton,
        toastCloseButton: props.toastOptions?.closeButton,
        closeButtonAriaLabel: props.toastOptions?.closeButtonAriaLabel,
        containerAriaLabel: props.containerAriaLabel,
        mobileOffset: props.mobileOffset,
        style: props.style,
      });
      return createElement("div", {
        "data-sonner-toaster": "",
        "data-position": props.position,
      });
    },
  };
});

import { AppToaster } from "./app-toaster";

let container: HTMLDivElement;
let root: Root | null;
let mobileViewport: boolean;
let matchMediaCallCount: number;
const mediaQueryListeners = new Set<EventListener>();

const mediaQueryList = {
  get matches(): boolean {
    return mobileViewport;
  },
  media: "(max-width: 600px)",
  onchange: null,
  addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
    if (typeof listener === "function") mediaQueryListeners.add(listener);
  }),
  removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
    if (typeof listener === "function") mediaQueryListeners.delete(listener);
  }),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(() => true),
} as unknown as MediaQueryList;

function latestRenderedProps(): (typeof sonnerMock.rendered)[number] {
  const props = sonnerMock.rendered.at(-1);
  if (!props) throw new Error("Sonner Toaster was not rendered");
  return props;
}

function dispatchMediaChange(): void {
  const event = new Event("change");
  for (const listener of mediaQueryListeners) listener(event);
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mobileViewport = false;
  matchMediaCallCount = 0;
  mediaQueryListeners.clear();
  vi.clearAllMocks();
  sonnerMock.rendered.length = 0;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => {
      matchMediaCallCount += 1;
      return mediaQueryList;
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("application toast foundation", () => {
  it("mounts one provider from the server root for public and protected routes", () => {
    const rootLayout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    const protectedLayout = readFileSync(join(process.cwd(), "app/app/layout.tsx"), "utf8");

    expect(rootLayout).not.toMatch(/^\s*["']use client["']/m);
    expect(rootLayout.match(/<AppToaster\s*\/>/g)).toHaveLength(1);
    expect(rootLayout).toContain("{children}");
    expect(protectedLayout).not.toMatch(/AppToaster|<Toaster/);

    act(() => root?.render(createElement(AppToaster)));
    expect(container.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
  });

  it("uses the desktop position, DEMI tokens, and accessible bounded defaults", () => {
    act(() => root?.render(createElement(AppToaster)));

    expect(container.querySelector("[data-sonner-toaster]")?.getAttribute("data-position")).toBe("top-right");
    expect(latestRenderedProps()).toMatchObject({
      position: "top-right",
      visibleToasts: 3,
      closeButton: true,
      toastCloseButton: true,
      closeButtonAriaLabel: "ปิดการแจ้งเตือน",
      containerAriaLabel: "การแจ้งเตือน",
    });
    const statusTokens = latestRenderedProps().style as Record<string, string>;
    expect(statusTokens["--success-bg"]).toBe("var(--success-soft)");
    expect(statusTokens["--success-text"]).toBe("var(--success)");
    expect(statusTokens["--warning-bg"]).toBe("var(--warning-soft)");
    expect(statusTokens["--error-bg"]).toBe("var(--danger-soft)");
    expect(statusTokens["--info-bg"]).toBe("var(--info-soft)");
    expect(latestRenderedProps().mobileOffset).toMatchObject({
      left: "1rem",
      right: "1rem",
      bottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)",
    });
  });

  it("switches the same toaster to bottom-center as the mobile media query changes", () => {
    act(() => root?.render(createElement(AppToaster)));
    expect(container.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
    expect(latestRenderedProps().position).toBe("top-right");
    expect(mediaQueryListeners.size).toBe(1);

    mobileViewport = true;
    act(dispatchMediaChange);
    expect(container.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
    expect(latestRenderedProps().position).toBe("bottom-center");
    expect(container.querySelector("[data-sonner-toaster]")?.getAttribute("data-position")).toBe("bottom-center");

    mobileViewport = false;
    act(dispatchMediaChange);
    expect(latestRenderedProps().position).toBe("top-right");
    expect(container.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
  });

  it("cleans up its media query listener on unmount", () => {
    act(() => root?.render(createElement(AppToaster)));
    expect(mediaQueryListeners.size).toBe(1);

    act(() => {
      root?.unmount();
      root = null;
    });

    expect(mediaQueryListeners.size).toBe(0);
    expect(mediaQueryList.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("uses the stable desktop server snapshot before switching to the mobile position after hydration", async () => {
    mobileViewport = true;
    const serverMarkup = renderToString(createElement(AppToaster));
    expect(serverMarkup).toContain('data-position="top-right"');
    expect(matchMediaCallCount).toBe(0);

    act(() => {
      root?.unmount();
      root = null;
    });
    container.innerHTML = serverMarkup;

    await act(async () => {
      root = hydrateRoot(container, createElement(AppToaster));
    });

    expect(container.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
    expect(latestRenderedProps().position).toBe("bottom-center");
  });
});
