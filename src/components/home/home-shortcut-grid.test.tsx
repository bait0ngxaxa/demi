import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

type MockLinkProps = {
  children?: ReactNode;
  className?: string;
  href: string;
  prefetch?: boolean;
};

vi.mock("next/link", async () => {
  const { createElement: h } = await import("react");

  return {
    default: ({ children, href, prefetch, ...props }: MockLinkProps) =>
      h("a", { ...props, href, "data-prefetch": String(prefetch) }, children),
  };
});

import { HomeShortcutGrid, type HomeShortcut } from "./home-shortcut-grid";

const shortcuts: readonly HomeShortcut[] = [
  { href: "/app/patients", icon: "patients", label: "รายชื่อผู้ป่วย", prefetch: true },
  { href: "/app/appointments", icon: "appointments", label: "นัดหมาย", description: "ดูนัดหมายของคุณ" },
  { href: "/app/personal/measurements", icon: "measurements", label: "ข้อมูลสุขภาพ" },
];

function renderShortcutGrid(): string {
  return renderToStaticMarkup(
    createElement(HomeShortcutGrid, {
      heading: "เมนูทดสอบ",
      headingId: "test-shortcuts-heading",
      shortcuts,
    }),
  );
}

function getRenderedLinks(markup: string): Array<{ attributes: string; content: string }> {
  return [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes = "", content = ""]) => ({
    attributes,
    content,
  }));
}

function getAttribute(attributes: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(attributes)?.[1];
}

describe("HomeShortcutGrid", () => {
  it("keeps shortcuts as one accessible link each with their original destination and order", () => {
    const markup = renderShortcutGrid();
    const links = getRenderedLinks(markup);

    expect(markup).toContain('<nav aria-labelledby="test-shortcuts-heading"');
    expect(markup).toMatch(/<nav\b[^>]*><ul\b[^>]*><li\b[^>]*><a\b/);
    expect(markup).toContain("<ul class=\"grid min-w-0 grid-cols-4");
    expect(markup).not.toContain("<button");
    expect(links).toHaveLength(shortcuts.length);
    expect(links.map(({ attributes }) => getAttribute(attributes, "href"))).toEqual(
      shortcuts.map(({ href }) => href),
    );

    for (const [index, link] of links.entries()) {
      expect(link.content).toContain(shortcuts[index].label);
      expect(link.content).toContain('<svg aria-hidden="true"');
      expect(link.content).not.toContain("<a ");
    }
  });

  it("uses elevated mobile tiles while retaining the desktop grid and card layout", () => {
    const markup = renderShortcutGrid();
    const links = getRenderedLinks(markup);

    expect(markup).toContain("gap-2 sm:gap-3 lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]");
    for (const { attributes } of links) {
      const className = getAttribute(attributes, "class") ?? "";
      expect(className).toContain("min-h-24");
      expect(className).toContain("border border-border bg-surface");
      expect(className).toContain("shadow-surface");
      expect(className).toContain("hover:border-border-strong hover:bg-surface-muted");
      expect(className).toContain("active:translate-y-px");
      expect(className).toContain("focus-visible:ring-4 focus-visible:ring-focus-ring");
      expect(className).toContain("focus-visible:ring-offset-2 focus-visible:ring-offset-canvas");
      expect(className).toContain("lg:active:translate-y-0");
      expect(className).toContain("motion-reduce:transition-none motion-reduce:active:translate-y-0");
      expect(className).toContain("lg:flex-row");
      expect(className).toContain("lg:shadow-none");
    }
    expect(markup).toContain(
      'class="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong lg:bg-surface-muted"',
    );
  });

  it("keeps descriptions desktop-only and preserves the existing prefetch setting", () => {
    const links = getRenderedLinks(renderShortcutGrid());

    expect(links[0].attributes).toContain('data-prefetch="true"');
    expect(links[1].attributes).toContain('data-prefetch="false"');
    expect(links[2].attributes).toContain('data-prefetch="false"');
    expect(links[1].content).toContain('class="hidden truncate');
    expect(links[1].content).toContain("lg:block");
    expect(links[1].content).toContain("ดูนัดหมายของคุณ");
    expect(links[0].content).not.toContain("description");
  });
});
