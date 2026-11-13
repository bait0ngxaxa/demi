import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoadingIndicator } from "./loading-indicator";

describe("LoadingIndicator", () => {
  it.each([["sm", "size-4"], ["md", "size-8"]] as const)("renders the %s CSS-only decorative ring", (size, sizeClass) => {
    const markup = renderToStaticMarkup(<LoadingIndicator size={size} />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain(sizeClass);
    expect(markup).toContain("motion-safe:animate-spin");
    expect(markup).toContain("border-line border-t-brand");
    expect(markup).toMatch(/><\/span>$/u);
  });
});
