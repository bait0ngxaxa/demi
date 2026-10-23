"use client";

import type { CSSProperties } from "react";
import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";

const mobileViewportQuery = "(max-width: 600px)";

function subscribeToMobileViewport(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mediaQuery = window.matchMedia(mobileViewportQuery);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getMobileViewportSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(mobileViewportQuery).matches;
}

function getServerMobileViewportSnapshot(): boolean {
  return false;
}

const demiToastTokens = {
  "--normal-bg": "var(--surface)",
  "--normal-border": "var(--line)",
  "--normal-text": "var(--ink)",
  "--success-bg": "var(--success-soft)",
  "--success-border": "var(--success)",
  "--success-text": "var(--success)",
  "--warning-bg": "var(--warning-soft)",
  "--warning-border": "var(--warning)",
  "--warning-text": "var(--warning)",
  "--error-bg": "var(--danger-soft)",
  "--error-border": "var(--danger)",
  "--error-text": "var(--danger)",
  "--info-bg": "var(--info-soft)",
  "--info-border": "var(--info)",
  "--info-text": "var(--info)",
} as CSSProperties;

export function AppToaster(): React.JSX.Element {
  const isMobile = useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    getServerMobileViewportSnapshot,
  );

  return (
    <Toaster
      className="demi-toaster"
      closeButton
      containerAriaLabel="การแจ้งเตือน"
      offset={{ top: "calc(var(--app-sticky-top) + 1rem)", right: "1rem" }}
      mobileOffset={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)",
        left: "1rem",
        right: "1rem",
      }}
      position={isMobile ? "bottom-center" : "top-right"}
      richColors
      style={demiToastTokens}
      theme="light"
      toastOptions={{
        closeButton: true,
        closeButtonAriaLabel: "ปิดการแจ้งเตือน",
        style: {
          borderRadius: "var(--demi-radius-control)",
          boxShadow: "var(--demi-shadow-surface)",
          fontFamily: 'var(--font-noto-sans-thai), "Leelawadee UI", "Segoe UI", sans-serif',
          fontSize: "0.875rem",
        },
      }}
      visibleToasts={3}
    />
  );
}
