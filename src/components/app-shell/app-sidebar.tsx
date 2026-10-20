"use client";

import { useEffect, useState, useSyncExternalStore, type SyntheticEvent } from "react";

import { classNames } from "@/components/ui/class-names";

import {
  applyDesktopSidebarRootState,
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
import { MobileNavigationGlyph } from "./mobile-navigation-glyph";
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

const THAI_LEADING_VOWELS = /^[\u0E40-\u0E44]/u;

/** One visible initial: the first letter of the name, skipping Thai leading vowels (เ แ โ ใ ไ). */
export function getDisplayNameInitial(displayName: string): string | null {
  const first = displayName.trim().replace(THAI_LEADING_VOWELS, "").charAt(0);
  return /\p{L}/u.test(first) ? first.toLocaleUpperCase("th-TH") : null;
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
    applyDesktopSidebarRootState(document.documentElement, browserSidebarState);
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

  applyDesktopSidebarRootState(document.documentElement, state);
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

  const initial = getDisplayNameInitial(displayName);
  const roleLine = roleLabels.length > 0 ? roleLabels.join(" · ") : "ผู้ใช้งาน DEMI";
  const showTooltip = (event: SyntheticEvent): void => setTooltip(collapsed ? tooltipFor(event) : null);
  const hideTooltip = (): void => setTooltip(null);

  useEffect(() => {
    // Keeps the CSS width in step with the stored preference even if the pre-paint script could not run.
    applyDesktopSidebarRootState(document.documentElement, getBrowserSidebarSnapshot());
    const frame = window.requestAnimationFrame(() => setTransitionsReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <aside
      className={classNames(
        // overflow-x-clip clips the width transition without creating a second scroll container.
        "app-desktop-sidebar sticky top-0 hidden h-svh shrink-0 overflow-x-clip bg-navigation-background text-white lg:flex lg:flex-col",
        transitionsReady &&
          "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none",
      )}
      data-state={state}
      onBlur={hideTooltip}
      onFocus={showTooltip}
      onKeyDown={(event) => {
        if (event.key === "Escape") hideTooltip();
      }}
      onMouseLeave={hideTooltip}
      onMouseOver={showTooltip}
    >
      {/* Same height as the content header, so both bottom borders share --app-header-height. */}
      <div
        className={classNames(
          "flex h-app-header shrink-0 items-center border-b border-white/12",
          expanded ? "justify-between gap-2 pl-5 pr-3" : "justify-center px-2",
        )}
      >
        {expanded ? (
          <div className="min-w-0">
            <p className="text-xl font-bold leading-6 tracking-[-0.03em]">DEMI</p>
            <p className="truncate text-xs leading-5 text-white/65">ระบบบริการสุขภาพ</p>
          </div>
        ) : (
          <span className="sr-only">DEMI ระบบบริการสุขภาพ</span>
        )}
        <DesktopSidebarToggle
          expanded={expanded}
          onToggle={() => setBrowserSidebarState(toggleDesktopSidebarState(state))}
        />
      </div>
      {availableWorkspaces.length > 1 ? (
        <div className={classNames("shrink-0 border-b border-white/12 py-1.5", collapsed ? "px-2" : "px-4")}>
          <WorkspaceSwitch
            availableWorkspaces={availableWorkspaces}
            collapsed={collapsed}
            hrefs={{ personal: "/app/personal", work: "/app" }}
            tone="desktop"
          />
        </div>
      ) : null}
      {/* The only scrolling region; the account section is its last section (NAVIGATION_SECTION_ORDER). */}
      <nav
        aria-label="เมนูหลัก"
        className={classNames("app-sidebar-scroll min-h-0 flex-1 overflow-y-auto py-3", collapsed ? "px-1" : "pl-3 pr-1")}
        data-rail={collapsed ? "" : undefined}
        id="desktop-application-navigation"
        onScroll={hideTooltip}
      >
        <NavigationList collapsed={collapsed} density="compact" groups={navigation} />
      </nav>
      <div
        className={classNames(
          "flex shrink-0 items-center border-t border-white/12",
          expanded ? "h-16 gap-3 px-4" : "flex-col justify-center gap-1 px-2 py-2",
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/14 text-sm font-semibold text-white"
          data-navigation-tooltip={collapsed ? `${displayName} · ${roleLine}` : undefined}
        >
          {initial ?? <MobileNavigationGlyph icon="profile" />}
        </span>
        {expanded ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-5 text-white">{displayName}</p>
            <p className="truncate text-xs leading-4 text-white/65">{roleLine}</p>
          </div>
        ) : (
          <span className="sr-only">{`${displayName} · ${roleLine}`}</span>
        )}
        <LogoutButton iconOnly />
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
