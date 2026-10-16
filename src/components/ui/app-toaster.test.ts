import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import type { ToasterProps } from "sonner";
import { AppToaster } from "./app-toaster";

describe("application toast foundation", () => {
  it("mounts one provider from the server root for public and protected routes", () => {
    const rootLayout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    const protectedLayout = readFileSync(join(process.cwd(), "app/app/layout.tsx"), "utf8");

    expect(rootLayout).not.toMatch(/^\s*["']use client["']/m);
    expect(rootLayout.match(/<AppToaster\s*\/>/g)).toHaveLength(1);
    expect(rootLayout).toContain("{children}");
    expect(protectedLayout).not.toMatch(/AppToaster|<Toaster/);
  });

  it("configures DEMI status tokens, accessible close controls, and bounded defaults", () => {
    const element = AppToaster();
    if (!isValidElement<ToasterProps>(element)) {
      throw new Error("AppToaster must render Sonner's Toaster");
    }

    const props = element.props;
    const statusTokens = props.style as Record<string, string>;

    expect(props.position).toBe("top-right");
    expect(props.visibleToasts).toBe(3);
    expect(props.closeButton).toBe(true);
    expect(props.toastOptions?.closeButton).toBe(true);
    expect(props.toastOptions?.closeButtonAriaLabel).toBe("ปิดการแจ้งเตือน");
    expect(props.containerAriaLabel).toBe("การแจ้งเตือน");
    expect(statusTokens["--success-bg"]).toBe("var(--success-soft)");
    expect(statusTokens["--success-text"]).toBe("var(--success)");
    expect(statusTokens["--warning-bg"]).toBe("var(--warning-soft)");
    expect(statusTokens["--error-bg"]).toBe("var(--danger-soft)");
    expect(statusTokens["--info-bg"]).toBe("var(--info-soft)");
  });

  it("uses safe-area and keyboard offsets and switches one provider to bottom-center on mobile", () => {
    const element = AppToaster();
    if (!isValidElement<ToasterProps>(element)) {
      throw new Error("AppToaster must render Sonner's Toaster");
    }

    const mobileOffset = element.props.mobileOffset;
    if (typeof mobileOffset !== "object" || mobileOffset === null) {
      throw new Error("Expected per-edge mobile offsets");
    }
    const styles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    expect(mobileOffset).toMatchObject({ left: "1rem", right: "1rem", top: "1rem" });
    expect(mobileOffset?.bottom).toContain("env(safe-area-inset-bottom, 0px)");
    expect(mobileOffset?.bottom).toContain("env(keyboard-inset-height, 0px)");
    expect(styles).toMatch(/@media \(max-width: 600px\)\s*\{[\s\S]*?\.demi-toaster\[data-y-position="top"\]\s*\{\s*top: auto;\s*bottom: var\(--mobile-offset-bottom\);/);
    expect(styles).toMatch(/\.demi-toaster\[data-x-position="right"\]\s*\{\s*left: var\(--mobile-offset-left\);\s*right: var\(--mobile-offset-right\);\s*width: calc\(100vw - var\(--mobile-offset-left\) - var\(--mobile-offset-right\)\);/);
  });
});
