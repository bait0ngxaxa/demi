import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProtectedApplicationShellSkeleton } from "./app-shell-skeleton";

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
});
