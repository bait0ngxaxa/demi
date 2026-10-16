"use client";

import type { CSSProperties } from "react";
import { Toaster } from "sonner";

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
  return (
    <Toaster
      className="demi-toaster"
      closeButton
      containerAriaLabel="การแจ้งเตือน"
      offset={{ top: "calc(var(--app-header-height) + 1rem)", right: "1rem" }}
      mobileOffset={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem + env(keyboard-inset-height, 0px))",
        left: "1rem",
        right: "1rem",
        top: "1rem",
      }}
      position="top-right"
      richColors
      style={demiToastTokens}
      theme="light"
      toastOptions={{
        closeButton: true,
        closeButtonAriaLabel: "ปิดการแจ้งเตือน",
        style: {
          borderRadius: "var(--demi-radius-control)",
          boxShadow: "var(--demi-shadow-surface)",
          fontFamily: 'var(--font-geist-sans), "Noto Sans Thai", "Leelawadee UI", "Segoe UI", sans-serif',
          fontSize: "0.875rem",
        },
      }}
      visibleToasts={3}
    />
  );
}
