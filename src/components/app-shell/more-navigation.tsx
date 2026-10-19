"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { classNames } from "@/components/ui/class-names";

import {
  DESKTOP_NAV_MEDIA_QUERY,
  setupMobileNavigationLifecycle,
} from "./mobile-navigation-lifecycle";
import { NavigationList } from "./navigation-list";
import { confirmMobileNavigation } from "./mobile-navigation-guard";
import {
  projectMoreNavigation,
  type MobileNavigationProjection,
  type MobileNavigationTab,
} from "./mobile-tab-projection";
import type {
  ApplicationNavigationGroup,
  ApplicationWorkspaceContext,
} from "./navigation-types";
import { MobileNavigationGlyph } from "./mobile-navigation-glyph";

type MoreNavigationProps = {
  active: boolean;
  availableWorkspaces: MobileNavigationProjection["availableWorkspaces"];
  navigation: readonly ApplicationNavigationGroup[];
  primaryTabs: readonly MobileNavigationTab[];
  selectedWorkspace: ApplicationWorkspaceContext;
};

export function MoreNavigation({
  active,
  availableWorkspaces,
  navigation,
  primaryTabs,
  selectedWorkspace,
}: MoreNavigationProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeIdentity = `${pathname}?${searchParams.toString()}`;
  const [dialogState, setDialogState] = useState(() => ({ routeIdentity, open: false }));
  if (dialogState.routeIdentity !== routeIdentity) {
    setDialogState({ routeIdentity, open: false });
  }
  const open = dialogState.routeIdentity === routeIdentity && dialogState.open;
  const [navigating, startNavigation] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const moreGroups = projectMoreNavigation(navigation, primaryTabs);

  useEffect(() => {
    if (!open) {
      return;
    }

    const trigger = triggerRef.current;
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const desktopMedia = window.matchMedia(DESKTOP_NAV_MEDIA_QUERY);

    function handleTabKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);

      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const cleanupLifecycle = setupMobileNavigationLifecycle({
      document,
      dialog,
      mediaQueryList: desktopMedia,
      onDesktopTransition: () => {
        restoreFocusRef.current = false;
        setDialogState({ routeIdentity, open: false });
      },
      onEscape: () => {
        restoreFocusRef.current = true;
        setDialogState({ routeIdentity, open: false });
      },
      onTabKeyDown: handleTabKeyDown,
    });

    if (!desktopMedia.matches) {
      panelRef.current?.querySelector<HTMLButtonElement>("[data-drawer-close]")?.focus();
    }

    return () => {
      cleanupLifecycle();
      const shouldRestoreFocus = restoreFocusRef.current;
      restoreFocusRef.current = false;

      if (shouldRestoreFocus) {
        trigger?.focus();
      } else {
        document.getElementById("application-main-content")?.focus({ preventScroll: true });
      }
    };
  }, [open, routeIdentity]);

  return (
    <>
      <button
        aria-busy={navigating || undefined}
        aria-controls={open ? "mobile-more-navigation" : undefined}
        aria-current={active ? "location" : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="เพิ่มเติม"
        className={classNames(
          "flex h-full min-h-11 w-full min-w-0 flex-col items-center justify-center rounded-control px-1 text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-inset motion-reduce:transition-none",
          active ? "type-nav-active bg-brand-soft text-brand-strong" : "hover:bg-surface-muted hover:text-text",
        )}
        onClick={() => {
          restoreFocusRef.current = false;
          setDialogState({ routeIdentity, open: true });
        }}
        ref={triggerRef}
        type="button"
      >
        <MobileNavigationGlyph icon="more" />
        <span className="text-xs leading-4">เพิ่มเติม</span>
      </button>
      <span className="sr-only" role="status">{navigating ? "กำลังเปิดหน้า" : ""}</span>
      {open ? (
        <dialog
          aria-label={`เมนูเพิ่มเติม · ${selectedWorkspace === "personal" ? "พื้นที่ส่วนตัว" : "พื้นที่งาน"}`}
          className="fixed inset-0 m-0 h-svh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-text backdrop:bg-brand-deep/45"
          id="mobile-more-navigation"
          onCancel={(event) => {
            event.preventDefault();
            restoreFocusRef.current = true;
            setDialogState({ routeIdentity, open: false });
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              restoreFocusRef.current = true;
              setDialogState({ routeIdentity, open: false });
            }
          }}
          ref={dialogRef}
        >
          <div
            className="app-mobile-drawer-panel flex h-full w-[min(20rem,88vw)] flex-col bg-surface shadow-floating"
            ref={panelRef}
          >
            <div className="flex min-h-app-header shrink-0 items-center justify-between border-b border-border px-4">
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-[-0.03em] text-text">DEMI</p>
                <p className="truncate text-xs text-text-muted">
                  เพิ่มเติม · {selectedWorkspace === "personal" ? "พื้นที่ส่วนตัว" : "พื้นที่งาน"}
                </p>
              </div>
              <button
                aria-label="ปิดเมนูเพิ่มเติม"
                className="flex size-11 shrink-0 items-center justify-center rounded-control text-text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                data-drawer-close
                onClick={() => {
                  restoreFocusRef.current = true;
                  setDialogState({ routeIdentity, open: false });
                }}
                type="button"
              >
                <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
            <nav
              aria-label="เมนูเพิ่มเติม"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6"
            >
              <NavigationList
                availableContexts={availableWorkspaces}
                groups={moreGroups}
                onNavigate={(event, href) => {
                  event.preventDefault();
                  if (!confirmMobileNavigation()) {
                    return;
                  }
                  restoreFocusRef.current = false;
                  setDialogState({ routeIdentity, open: false });
                  startNavigation(() => {
                    router.push(href);
                  });
                }}
                tone="mobile"
              />
            </nav>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
