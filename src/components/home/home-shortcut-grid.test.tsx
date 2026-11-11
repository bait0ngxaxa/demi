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
  { href: "/app/patients/assigned", icon: "care", label: "รายการดูแลสุขภาพต่อเนื่องที่โรงพยาบาลมอบหมายให้ผู้ป่วย" },
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

function decodeAttribute(value: string): string {
  return value.replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
}

describe("HomeShortcutGrid", () => {
  it("keeps shortcuts as one accessible link each with their original destination and order", () => {
    const markup = renderShortcutGrid();
    const links = getRenderedLinks(markup);

    expect(markup).toContain('<nav aria-labelledby="test-shortcuts-heading"');
    expect(markup).toMatch(/<nav\b[^>]*><ul\b[^>]*><li\b[^>]*><a\b/);
    expect(markup).toContain("<ul class=\"grid min-w-0 grid-cols-4 ");
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

  it("renders card-less mobile icon buttons on an unstretched grid while retaining the desktop card layout", () => {
    const markup = renderShortcutGrid();
    const links = getRenderedLinks(markup);
    const listClass = /<ul class="([^"]*)"/.exec(markup)?.[1]?.split(" ") ?? [];

    expect(listClass).toEqual(expect.arrayContaining(["grid-cols-4", "gap-x-2", "gap-y-3", "sm:gap-x-3", "text-sm"]));
    expect(listClass).toEqual(expect.arrayContaining(["lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]", "lg:gap-3"]));
    expect(listClass).not.toContain("auto-rows-fr");
    expect(listClass).not.toContain("lg:auto-rows-auto");

    for (const { attributes, content } of links) {
      const linkClass = (getAttribute(attributes, "class") ?? "").split(" ");
      // Below lg the whole column is the hit area: no card surface, no row stretch, content starts at the top.
      expect(linkClass).toEqual(expect.arrayContaining(["group", "flex-col", "items-center", "justify-start", "text-sm"]));
      for (const removed of ["border", "border-border", "bg-surface", "shadow-surface", "h-full", "min-h-24", "justify-center"]) {
        expect(linkClass).not.toContain(removed);
      }
      expect(linkClass).toEqual(
        expect.arrayContaining([
          "focus-visible:outline-none",
          "focus-visible:ring-4",
          "focus-visible:ring-focus-ring",
          "focus-visible:ring-offset-2",
          "focus-visible:ring-offset-canvas",
        ]),
      );
      // lg+: the existing desktop card is restored explicitly.
      expect(linkClass).toEqual(
        expect.arrayContaining([
          "lg:min-h-16",
          "lg:flex-row",
          "lg:justify-start",
          "lg:gap-3",
          "lg:rounded-control",
          "lg:border",
          "lg:border-border",
          "lg:bg-surface",
          "lg:px-4",
          "lg:py-3",
          "lg:text-left",
          "lg:text-sm",
          "lg:hover:border-action-primary",
          "lg:hover:bg-brand-soft",
          "lg:focus-visible:border-action-primary",
        ]),
      );
      expect(linkClass).not.toContain("lg:h-full");

      const iconClass = decodeAttribute(/<span class="([^"]*)"><svg aria-hidden="true"/.exec(content)?.[1] ?? "").split(" ");
      expect(iconClass).toEqual(
        expect.arrayContaining([
          "size-15",
          "bg-brand-soft",
          "text-brand-strong",
          "group-active:translate-y-px",
          "group-active:bg-brand-pale",
          "motion-reduce:group-active:translate-y-0",
          "[&>svg]:size-7",
        ]),
      );
      expect(iconClass).toEqual(
        expect.arrayContaining([
          "lg:size-10",
          "lg:rounded-control",
          "lg:bg-surface-muted",
          "lg:shadow-none",
          "lg:group-active:translate-y-0",
          "lg:[&>svg]:size-5",
        ]),
      );

      const labelClass = (/<span class="([^"]*)">[^<]+<\/span>/.exec(content)?.[1] ?? "").split(" ");
      expect(labelClass).toEqual(
        expect.arrayContaining(["min-h-[2lh]", "line-clamp-2", "[overflow-wrap:anywhere]", "lg:min-h-0", "lg:line-clamp-none"]),
      );
    }
  });

  it("keeps descriptions desktop-only and preserves the existing prefetch setting", () => {
    const links = getRenderedLinks(renderShortcutGrid());

    expect(links[0].attributes).toContain('data-prefetch="true"');
    expect(links[1].attributes).toContain('data-prefetch="false"');
    expect(links[2].attributes).toContain('data-prefetch="false"');
    expect(links[3].attributes).toContain('data-prefetch="false"');
    expect(links[3].content).toContain("รายการดูแลสุขภาพต่อเนื่องที่โรงพยาบาลมอบหมายให้ผู้ป่วย");
    expect(links[1].content).toContain('class="hidden truncate');
    expect(links[1].content).toContain("lg:block");
    expect(links[1].content).toContain("ดูนัดหมายของคุณ");
    expect(links[0].content).not.toContain("description");
  });
});
