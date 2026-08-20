import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DesktopSidebarToggle } from "./desktop-sidebar-toggle";

describe("DesktopSidebarToggle", () => {
  it("exposes the expanded state and collapse action", () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopSidebarToggle, { expanded: true, onToggle: vi.fn() }),
    );

    expect(markup).toContain('aria-controls="desktop-application-navigation"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-label="ย่อเมนู"');
    expect(markup).toContain("ย่อเมนู");
  });

  it("exposes the collapsed state and expand action", () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopSidebarToggle, { expanded: false, onToggle: vi.fn() }),
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="ขยายเมนู"');
    expect(markup).toContain("ขยาย");
  });
});
