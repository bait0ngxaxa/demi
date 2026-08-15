"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import type { ApplicationNavigationGroup } from "./navigation-types";
import { NavigationList } from "./navigation-list";

type MobileNavigationProps = {
  navigation: readonly ApplicationNavigationGroup[];
};

export function MobileNavigation({ navigation }: MobileNavigationProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLButtonElement>("[data-drawer-close]")?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

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

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
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
        <div className="fixed inset-0 z-50">
          <button
            aria-label="ปิดเมนูหลัก"
            className="absolute inset-0 bg-brand-deep/45"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div
            aria-label="เมนูหลัก"
            aria-modal="true"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-surface shadow-floating"
            id="mobile-application-navigation"
            ref={panelRef}
            role="dialog"
          >
            <div className="flex min-h-app-header items-center justify-between border-b border-border px-5">
              <div>
                <p className="text-xl font-bold tracking-[-0.03em] text-text">DEMI</p>
                <p className="text-xs text-text-muted">เมนูพื้นที่ทำงาน</p>
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
            <nav aria-label="เมนูหลักบนมือถือ" className="flex-1 overflow-y-auto px-4 py-6">
              <NavigationList groups={navigation} onNavigate={() => setOpen(false)} tone="mobile" />
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
