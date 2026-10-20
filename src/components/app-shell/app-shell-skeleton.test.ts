import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MoreNavigationSkeleton, ProtectedApplicationShellSkeleton } from "./app-shell-skeleton";

describe("ProtectedApplicationShellSkeleton", () => {
  it("announces loading once without exposing interactive navigation", () => {
    const markup = renderToStaticMarkup(createElement(ProtectedApplicationShellSkeleton));

    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("กำลังเตรียมพื้นที่ใช้งาน...");
    expect(markup).not.toMatch(/<a(?:\s|>)/);
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("href=");
  });

  it("provides a non-interactive More page skeleton with the shared menu layout", () => {
    const markup = renderToStaticMarkup(createElement(MoreNavigationSkeleton));

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("กำลังโหลดเมนูเพิ่มเติม...");
    expect(markup).toContain("content-workspace");
    expect(markup).toContain("min-h-12");
    expect(markup).not.toMatch(/<a(?:\s|>)/);
    expect(markup).not.toContain("<button");
  });
});
