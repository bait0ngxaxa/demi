"use client";

import { useEffect, useState, useSyncExternalStore, type SyntheticEvent } from "react";

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
import { LogoutButton } from "./logout-button";
import type { ApplicationNavigationGroup, ApplicationWorkspaceContext } from "./navigation-types";
import { NavigationList } from "./navigation-list";
import { WorkspaceSwitch } from "./workspace-switch";

type AppSidebarProps = {
  availableWorkspaces: readonly ApplicationWorkspaceContext[];
  displayName: string;
  navigation: readonly ApplicationNavigationGroup[];
  roleLabels: readonly string[];
};

type RailTooltip = { label: string; top: number; left: number };

/** Rail tooltips are positioned on the viewport so the scrolling nav cannot clip them; they never take focus. */
function tooltipFor(event: SyntheticEvent): RailTooltip | null {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-navigation-tooltip]") : null;
  const label = target?.dataset.navigationTooltip;
  if (!target || !label) return null;
  const rect = target.getBoundingClientRect();
  return { label, top: rect.top + rect.height / 2, left: rect.right + 8 };
}

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

export function AppSidebar({
  availableWorkspaces,
  displayName,
  navigation,
  roleLabels,
}: AppSidebarProps): React.JSX.Element {
  const state = useSyncExternalStore(
    subscribeToBrowserSidebarState,
    getBrowserSidebarSnapshot,
    getServerSidebarSnapshot,
  );
  const [transitionsReady, setTransitionsReady] = useState(false);
  const [tooltip, setTooltip] = useState<RailTooltip | null>(null);
  const expanded = state === "expanded";
  const collapsed = !expanded;
  const sections = navigation.filter(({ id }) => id !== "account");
  const account = navigation.filter(({ id }) => id === "account");
  const showTooltip = (event: SyntheticEvent): void => setTooltip(collapsed ? tooltipFor(event) : null);
  const hideTooltip = (): void => setTooltip(null);

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
          <p className="mt-1 truncate text-sm text-white/65">ระบบบริการสุขภาพ</p>
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
      <div
        className="flex min-h-0 flex-1 flex-col"
        onBlur={hideTooltip}
        onFocus={showTooltip}
        onKeyDown={(event) => {
          if (event.key === "Escape") hideTooltip();
        }}
        onMouseLeave={hideTooltip}
        onMouseOver={showTooltip}
      >
        {availableWorkspaces.length > 1 ? (
          <div className={classNames("shrink-0 border-b border-white/12 py-4", collapsed ? "px-3" : "px-4")}>
            <WorkspaceSwitch
              availableWorkspaces={availableWorkspaces}
              collapsed={collapsed}
              hrefs={{ personal: "/app/personal", work: "/app" }}
              tone="desktop"
            />
          </div>
        ) : null}
        <nav
          aria-label="เมนูหลัก"
          className={classNames("min-h-0 flex-1 overflow-y-auto py-6", collapsed ? "px-3" : "px-4")}
          id="desktop-application-navigation"
          onScroll={hideTooltip}
        >
          <NavigationList collapsed={collapsed} groups={sections} />
        </nav>
        <div className={classNames("shrink-0 space-y-3 border-t border-white/12 py-4", collapsed ? "px-3" : "px-4")}>
          {account.length > 0 ? (
            <nav aria-label="บัญชี">
              <NavigationList collapsed={collapsed} groups={account} />
            </nav>
          ) : null}
          {collapsed ? null : (
            <div className="min-w-0 px-3">
              <p className="truncate text-sm font-semibold text-white">{displayName}</p>
              <p className="truncate text-xs text-white/65">{roleLabels.length > 0 ? roleLabels.join(" · ") : "ผู้ใช้งาน DEMI"}</p>
            </div>
          )}
          {collapsed ? <LogoutButton iconOnly /> : <div className="px-3"><LogoutButton fullWidth /></div>}
        </div>
      </div>
      {tooltip ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-control bg-text px-2.5 py-1.5 text-xs font-medium text-white shadow-floating"
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          {tooltip.label}
        </div>
      ) : null}
    </aside>
  );
}
