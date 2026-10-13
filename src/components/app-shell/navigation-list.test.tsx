import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NavigationList } from "./navigation-list";
vi.mock("next/navigation", () => ({ usePathname: () => "/app/personal/knowledge" }));
vi.mock("next/link", () => ({ default: ({ prefetch, onNavigate, ...props }: { prefetch?: boolean; onNavigate?: () => void }) => <a data-prefetch={String(prefetch)} data-on-navigate={Boolean(onNavigate)} {...props} /> }));
describe("navigation protected prefetch projection", () => {
  it("passes false only for the requested private destination; existing defaults remain", () => {
    const html = renderToStaticMarkup(<NavigationList groups={[{ label: "ส่วนตัว", workspace: "personal", items: [
      { href: "/app/personal/wellness", label: "สุขภาพ", match: "prefix" },
      { href: "/app/personal/knowledge", label: "ข่าวสารและความรู้", match: "prefix", prefetch: false },
    ] }]} />);
    expect(html).toMatch(/<a(?=[^>]*href="\/app\/personal\/knowledge")(?=[^>]*data-prefetch="false")(?=[^>]*aria-current="page")[^>]*>/u);
    expect(html).toMatch(/<a(?=[^>]*href="\/app\/personal\/wellness")(?=[^>]*data-prefetch="undefined")[^>]*>/u);
  });

  it("separates the active workspace location from the active page and hides Work groups in Personal", () => {
    const html = renderToStaticMarkup(<NavigationList onNavigate={() => {}} tone="mobile" groups={[
      { label: "พื้นที่ใช้งาน", workspace: "all", items: [
        { href: "/app", label: "งาน", match: "exact", workspaceContext: "work" },
        { href: "/app/personal", label: "ส่วนตัว", match: "prefix", workspaceContext: "personal" },
      ] },
      { label: "ส่วนตัว", workspace: "personal", items: [{ href: "/app/personal/knowledge", label: "ข่าวสาร", match: "prefix" }] },
      { label: "งาน", workspace: "work", items: [{ href: "/app/workforce", label: "จัดการบุคลากร", match: "prefix" }] },
    ]} />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/aria-current="location"/g)).toHaveLength(1);
    expect(html).not.toContain("จัดการบุคลากร");
    expect(html).toContain('data-on-navigate="true"');
  });
});
