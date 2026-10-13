"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import {
  DESKTOP_NAV_MEDIA_QUERY,
  setupMobileNavigationLifecycle,
} from "./mobile-navigation-lifecycle";
import type { ApplicationNavigationGroup } from "./navigation-types";
import { NavigationList } from "./navigation-list";

type MobileNavigationProps = {
  navigation: readonly ApplicationNavigationGroup[];
};

export function MobileNavigation({ navigation }: MobileNavigationProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const skipFocusRestoreRef = useRef(false);

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
        skipFocusRestoreRef.current = true;
        setOpen(false);
      },
      onEscape: () => setOpen(false),
      onTabKeyDown: handleTabKeyDown,
    });

    if (!desktopMedia.matches) {
      panelRef.current?.querySelector<HTMLButtonElement>("[data-drawer-close]")?.focus();
    }

    return () => {
      cleanupLifecycle();
      const shouldRestoreFocus = !skipFocusRestoreRef.current;
      skipFocusRestoreRef.current = false;

      if (shouldRestoreFocus) {
        trigger?.focus();
      } else {
        document.getElementById("application-main-content")?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <Button
        aria-controls="mobile-application-navigation"
        aria-expanded={open}
        aria-label="เปิดเมนูหลัก"
        className="size-11 p-0"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        size="compact"
        variant="ghost"
      >
        <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      </Button>
      {open ? (
        <dialog
          aria-label="เมนูหลัก"
          className="fixed inset-0 m-0 h-svh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-text backdrop:bg-brand-deep/45"
          id="mobile-application-navigation"
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          ref={dialogRef}
        >
          <div
            className="flex h-full w-[min(20rem,88vw)] flex-col bg-surface shadow-floating"
            ref={panelRef}
          >
            <div className="flex min-h-app-header shrink-0 items-center justify-between border-b border-border px-5">
              <div>
                <p className="text-xl font-bold tracking-[-0.03em] text-text">DEMI</p>
                <p className="text-xs text-text-muted">เมนูหลัก</p>
              </div>
              <Button
                aria-label="ปิดเมนูหลัก"
                className="size-11 p-0"
                data-drawer-close
                onClick={() => setOpen(false)}
                size="compact"
                variant="ghost"
              >
                <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                </svg>
              </Button>
            </div>
            <nav aria-label="เมนูหลักบนมือถือ" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6">
              <NavigationList
                groups={navigation}
                onNavigate={() => {
                  skipFocusRestoreRef.current = true;
                  setOpen(false);
                }}
                tone="mobile"
              />
            </nav>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
