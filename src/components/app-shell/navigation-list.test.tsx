import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NavigationList } from "./navigation-list";
vi.mock("next/navigation", () => ({ usePathname: () => "/app/personal/knowledge" }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: { prefetch?: boolean }) => <a data-prefetch={String(prefetch)} {...props} /> }));
describe("navigation protected prefetch projection", () => {
  it("passes false only for the requested private destination; existing defaults remain", () => {
    const html = renderToStaticMarkup(<NavigationList groups={[{ label: "ส่วนตัว", workspace: "personal", items: [
      { href: "/app/personal/wellness", label: "สุขภาพ", match: "prefix" },
      { href: "/app/personal/knowledge", label: "ข่าวสารและความรู้", match: "prefix", prefetch: false },
    ] }]} />);
    expect(html).toMatch(/<a(?=[^>]*href="\/app\/personal\/knowledge")(?=[^>]*data-prefetch="false")(?=[^>]*aria-current="page")[^>]*>/u);
    expect(html).toMatch(/<a(?=[^>]*href="\/app\/personal\/wellness")(?=[^>]*data-prefetch="undefined")[^>]*>/u);
  });
});
