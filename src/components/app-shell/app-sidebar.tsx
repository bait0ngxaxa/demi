"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { classNames } from "@/components/ui/class-names";

import {
  DEFAULT_DESKTOP_SIDEBAR_STATE,
  DESKTOP_SIDEBAR_STORAGE_KEY,
  parseDesktopSidebarPreference,
  readDesktopSidebarPreference,
  toggleDesktopSidebarState,
  type DesktopSidebarState,
  writeDesktopSidebarPreference,
} from "./desktop-sidebar-state";
import { DesktopSidebarToggle } from "./desktop-sidebar-toggle";
import type { ApplicationNavigationGroup } from "./navigation-types";
import { NavigationList } from "./navigation-list";

type AppSidebarProps = {
  navigation: readonly ApplicationNavigationGroup[];
};

let browserSidebarState: DesktopSidebarState = DEFAULT_DESKTOP_SIDEBAR_STATE;
let browserSidebarStateInitialized = false;
const browserSidebarListeners = new Set<() => void>();

function getServerSidebarSnapshot(): DesktopSidebarState {
  return DEFAULT_DESKTOP_SIDEBAR_STATE;
}

function getBrowserSidebarSnapshot(): DesktopSidebarState {
  if (!browserSidebarStateInitialized) {
    browserSidebarStateInitialized = true;

    try {
      browserSidebarState = readDesktopSidebarPreference(window.localStorage);
    } catch {
      browserSidebarState = DEFAULT_DESKTOP_SIDEBAR_STATE;
    }
  }

  return browserSidebarState;
}

function notifyBrowserSidebarListeners(): void {
  browserSidebarListeners.forEach((listener) => listener());
}

function subscribeToBrowserSidebarState(listener: () => void): () => void {
  function handleStorage(event: StorageEvent): void {
    if (event.key !== DESKTOP_SIDEBAR_STORAGE_KEY) {
      return;
    }

    browserSidebarStateInitialized = true;
    browserSidebarState = parseDesktopSidebarPreference(event.newValue);
    notifyBrowserSidebarListeners();
  }

  browserSidebarListeners.add(listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    browserSidebarListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function setBrowserSidebarState(state: DesktopSidebarState): void {
  browserSidebarStateInitialized = true;
  browserSidebarState = state;

  try {
    writeDesktopSidebarPreference(window.localStorage, state);
  } catch {
    // The current in-memory preference still applies for this application shell.
  }

  notifyBrowserSidebarListeners();
}

export function AppSidebar({ navigation }: AppSidebarProps): React.JSX.Element {
  const state = useSyncExternalStore(
    subscribeToBrowserSidebarState,
    getBrowserSidebarSnapshot,
    getServerSidebarSnapshot,
  );
  const [transitionsReady, setTransitionsReady] = useState(false);
  const expanded = state === "expanded";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTransitionsReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <aside
      className={classNames(
        "sticky top-0 hidden h-svh shrink-0 overflow-hidden bg-navigation-background text-white lg:flex lg:flex-col",
        expanded ? "w-app-sidebar" : "w-app-sidebar-collapsed",
        transitionsReady &&
          "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none",
      )}
      data-state={state}
    >
      <div className="relative h-28 shrink-0 border-b border-white/12">
        <div
          aria-hidden={expanded ? undefined : true}
          className={classNames(
            "absolute inset-y-0 left-5 right-32 flex min-w-0 flex-col justify-center",
            expanded ? "opacity-100" : "opacity-0",
            transitionsReady &&
              "motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none",
          )}
        >
          <p className="text-2xl font-bold tracking-[-0.03em]">DEMI</p>
          <p className="mt-1 truncate text-sm text-white/65">ระบบงานบริการสุขภาพ</p>
        </div>
        <p
          aria-hidden={expanded ? true : undefined}
          className={classNames(
            "absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-control border border-white/18 text-base font-bold",
            expanded ? "opacity-0" : "opacity-100",
            transitionsReady &&
              "motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none",
          )}
        >
          <span aria-hidden="true">D</span>
          <span className="sr-only">DEMI</span>
        </p>
        <div
          className={classNames(
            "absolute top-3",
            expanded ? "right-4" : "right-2",
            transitionsReady &&
              "motion-safe:transition-[right] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none",
          )}
        >
          <DesktopSidebarToggle
            expanded={expanded}
            onToggle={() => setBrowserSidebarState(toggleDesktopSidebarState(state))}
          />
        </div>
      </div>
      <nav
        aria-hidden={expanded ? undefined : true}
        aria-label="เมนูหลัก"
        className={classNames(
          "w-app-sidebar flex-1 overflow-y-auto px-4 py-6",
          expanded ? "opacity-100" : "pointer-events-none opacity-0",
          transitionsReady &&
            "motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none",
        )}
        id="desktop-application-navigation"
        inert={expanded ? undefined : true}
      >
        <NavigationList groups={navigation} />
      </nav>
    </aside>
  );
}
