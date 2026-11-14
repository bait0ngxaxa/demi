// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PageNumberPagination } from "./page-number-pagination";
import { getPageNumberTokens, normalizePageNumbers } from "./page-number-tokens";

describe("page number tokens", () => {
  it.each([0, 1, 2, 5, 20, 1_000_000, Number.MAX_SAFE_INTEGER])("bounds and deduplicates %i pages", (total) => {
    for (const current of [1, 2, 3, 10, total - 1, total]) {
      for (const compact of [true, false]) {
        const tokens = getPageNumberTokens(current, total, compact);
        const pages = tokens.filter((token) => typeof token === "number");
        expect(new Set(tokens).size).toBe(tokens.length);
        expect(tokens.length).toBeLessThanOrEqual(9);
        expect(pages.every((value) => value >= 1 && value <= total)).toBe(true);
        if (total > 0) {
          expect(pages[0]).toBe(1);
          expect(pages.at(-1)).toBe(total);
          expect(pages).toContain(normalizePageNumbers(current, total).page);
        }
      }
    }
  });

  it("places ellipses only over ranges, filling a one-page gap", () => {
    expect(getPageNumberTokens(3, 20)).toEqual([1, 2, 3, 4, 5, 6, "ellipsis-end", 20]);
    expect(getPageNumberTokens(11, 20)).toEqual([1, "ellipsis-start", 9, 10, 11, 12, 13, "ellipsis-end", 20]);
    expect(getPageNumberTokens(20, 20)).toEqual([1, "ellipsis-start", 15, 16, 17, 18, 19, 20]);
    expect(getPageNumberTokens(5, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(getPageNumberTokens(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageNumberTokens(11, 20, true)).toEqual([1, "ellipsis-start", 11, "ellipsis-end", 20]);
  });

  it("normalizes invalid input without creating invalid targets", () => {
    expect(getPageNumberTokens(NaN, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(normalizePageNumbers(99, 5).page).toBe(5);
    expect(normalizePageNumbers(-10, 5).page).toBe(1);
    for (const total of [-1, NaN, Infinity, 1.5]) expect(getPageNumberTokens(1, total)).toEqual([]);
  });
});

function markup(page: number, totalPages: number): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<PageNumberPagination label="หน้าทดสอบ" page={page} totalPages={totalPages} getPageTarget={(value) => ({ href: `/list?hospitalId=a&page=${value}` })} />);
  return container;
}

describe("PageNumberPagination", () => {
  it.each([0, 1])("omits controls for %i pages", (total) => {
    expect(markup(1, total).innerHTML).toBe("");
  });

  it("exposes semantic targets, current page and non-interactive ellipses", () => {
    const container = markup(3, 20);
    expect(container.querySelector('nav[aria-label="หน้าทดสอบ"]')).not.toBeNull();
    expect(container.querySelector('a[aria-label="ไปหน้าที่ 5"]')?.getAttribute("href")).toBe("/list?hospitalId=a&page=5");
    expect(container.querySelector('a[aria-label="ไปหน้าแรก"]')?.getAttribute("href")).toContain("page=1");
    expect(container.querySelector('a[aria-label="ไปหน้าสุดท้าย"]')?.getAttribute("href")).toContain("page=20");
    expect(container.querySelector('[aria-current="page"]')?.getAttribute("aria-label")).toBe("หน้าปัจจุบัน 3");
    expect(container.querySelector('a[href$="page=3"]')).toBeNull();
    expect(container.querySelectorAll('li > span[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(container.querySelector('ul.sm\\:hidden')).not.toBeNull();
    expect(container.querySelector('ul.hidden.sm\\:flex')).not.toBeNull();
    expect(container.querySelector('a')?.className).toContain("min-w-11");
  });

  it("disables controls at both boundaries and retains legacy previous/next", () => {
    expect(markup(1, 2).querySelector('[aria-label="ก่อนหน้า"]')?.getAttribute("aria-disabled")).toBe("true");
    expect(markup(2, 2).querySelector('[aria-label="ถัดไป"]')?.getAttribute("aria-disabled")).toBe("true");
    const legacy = renderToStaticMarkup(<PageNumberPagination label="เดิม" page={2} totalPages={3} previous={{ href: "/previous" }} next={null} />);
    expect(legacy).toContain('href="/previous"');
    expect(legacy).not.toContain("<ul");
  });

  it("runs callback targets and prevents disabled selections", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);
    const select = vi.fn();
    await act(async () => root.render(<PageNumberPagination label="เลือกหน้า" page={1} totalPages={5} getPageTarget={(page) => ({ onSelect: () => select(page), disabled: page === 4 })} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="ไปหน้าสุดท้าย"]')?.click());
    expect(select).toHaveBeenCalledExactlyOnceWith(5);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="ไปหน้าที่ 4"]')?.disabled).toBe(true);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-current="page"]')?.click());
    expect(select).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
