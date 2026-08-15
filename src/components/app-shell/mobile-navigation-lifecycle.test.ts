import { describe, expect, it, vi } from "vitest";

import {
  DESKTOP_NAV_MEDIA_QUERY,
  setupMobileNavigationLifecycle,
} from "./mobile-navigation-lifecycle";

type KeyDownListener = (event: KeyboardEvent) => void;
type MediaChangeListener = (event: MediaQueryListEvent) => void;

function createLifecycleEnvironment(initialOverflow = "auto") {
  let keyDownListener: KeyDownListener | null = null;
  let mediaChangeListener: MediaChangeListener | null = null;

  const body = { style: { overflow: initialOverflow } };
  const mediaQueryList = {
    matches: false,
    addEventListener(type: "change", listener: MediaChangeListener): void {
      expect(type).toBe("change");
      mediaChangeListener = listener;
    },
    removeEventListener(type: "change", listener: MediaChangeListener): void {
      expect(type).toBe("change");
      if (mediaChangeListener === listener) {
        mediaChangeListener = null;
      }
    },
  };
  const document = {
    body,
    addEventListener(type: "keydown", listener: KeyDownListener): void {
      expect(type).toBe("keydown");
      keyDownListener = listener;
    },
    removeEventListener(type: "keydown", listener: KeyDownListener): void {
      expect(type).toBe("keydown");
      if (keyDownListener === listener) {
        keyDownListener = null;
      }
    },
  };

  return {
    body,
    document,
    mediaQueryList,
    dispatchKeyDown(event: KeyboardEvent): void {
      keyDownListener?.(event);
    },
    dispatchMediaChange(matches: boolean): void {
      mediaQueryList.matches = matches;
      mediaChangeListener?.(
        { matches, media: DESKTOP_NAV_MEDIA_QUERY } as MediaQueryListEvent,
      );
    },
    hasKeyDownListener(): boolean {
      return keyDownListener !== null;
    },
    hasMediaChangeListener(): boolean {
      return mediaChangeListener !== null;
    },
  };
}

describe("Mobile navigation lifecycle", () => {
  it("locks body scroll while open and restores it during normal cleanup", () => {
    const environment = createLifecycleEnvironment("scroll");
    const cleanup = setupMobileNavigationLifecycle({
      document: environment.document,
      mediaQueryList: environment.mediaQueryList,
      onDesktopTransition: vi.fn(),
      onEscape: vi.fn(),
      onTabKeyDown: vi.fn(),
    });

    expect(environment.body.style.overflow).toBe("hidden");
    expect(environment.hasKeyDownListener()).toBe(true);
    expect(environment.hasMediaChangeListener()).toBe(true);

    cleanup();

    expect(environment.body.style.overflow).toBe("scroll");
    expect(environment.hasKeyDownListener()).toBe(false);
    expect(environment.hasMediaChangeListener()).toBe(false);
  });

  it("closes on Escape and forwards other keys to focus containment", () => {
    const environment = createLifecycleEnvironment();
    const onEscape = vi.fn();
    const onTabKeyDown = vi.fn();
    const cleanup = setupMobileNavigationLifecycle({
      document: environment.document,
      mediaQueryList: environment.mediaQueryList,
      onDesktopTransition: vi.fn(),
      onEscape,
      onTabKeyDown,
    });

    environment.dispatchKeyDown({ key: "Escape" } as KeyboardEvent);
    environment.dispatchKeyDown({ key: "Tab" } as KeyboardEvent);

    expect(onEscape).toHaveBeenCalledOnce();
    expect(onTabKeyDown).toHaveBeenCalledOnce();

    cleanup();
  });

  it("closes on the desktop breakpoint and releases body scroll", () => {
    const environment = createLifecycleEnvironment();
    const onDesktopTransition = vi.fn();
    const cleanup = setupMobileNavigationLifecycle({
      document: environment.document,
      mediaQueryList: environment.mediaQueryList,
      onDesktopTransition,
      onEscape: vi.fn(),
      onTabKeyDown: vi.fn(),
    });

    environment.dispatchMediaChange(true);

    expect(onDesktopTransition).toHaveBeenCalledOnce();
    expect(environment.body.style.overflow).toBe("hidden");

    cleanup();

    expect(environment.body.style.overflow).toBe("auto");
  });

  it("does not lock scroll or attach hidden-drawer listeners when already desktop", () => {
    const environment = createLifecycleEnvironment("scroll");
    environment.mediaQueryList.matches = true;
    const onDesktopTransition = vi.fn();
    const cleanup = setupMobileNavigationLifecycle({
      document: environment.document,
      mediaQueryList: environment.mediaQueryList,
      onDesktopTransition,
      onEscape: vi.fn(),
      onTabKeyDown: vi.fn(),
    });

    expect(onDesktopTransition).toHaveBeenCalledOnce();
    expect(environment.body.style.overflow).toBe("scroll");
    expect(environment.hasKeyDownListener()).toBe(false);
    expect(environment.hasMediaChangeListener()).toBe(false);

    cleanup();
    expect(environment.body.style.overflow).toBe("scroll");
  });
});
