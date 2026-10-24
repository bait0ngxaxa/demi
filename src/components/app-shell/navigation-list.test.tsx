import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NavigationList } from "./navigation-list";
import type { ApplicationNavigationGroup } from "./navigation-types";
const location = vi.hoisted(() => ({ pathname: "/app/personal/knowledge", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}));
const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({
  default: ({ prefetch, onNavigate, ...props }: { prefetch?: boolean; onNavigate?: () => void }) => <a data-prefetch={String(prefetch)} data-on-navigate={Boolean(onNavigate)} {...props} />,
  useLinkStatus: () => linkStatus,
}));

const workGroups: ApplicationNavigationGroup[] = [
  { id: "administration", label: "บริหารโรงพยาบาล", workspace: "work", items: [{ href: "/app/workforce", label: "บุคลากร", match: "prefix" }] },
  { id: "home", label: null, workspace: "work", items: [{ href: "/app", label: "หน้าหลัก", match: "exact" }] },
  { id: "care", label: "ดูแลผู้ป่วย", workspace: "work", items: [
    { href: "/app/patients/assigned", label: "ผู้ป่วยที่ดูแล", match: "exact", badgeCount: 4 },
    { href: "/app/patients/assigned?task=screening", label: "รอคัดกรอง", match: "exact" },
  ] },
];

describe("navigation protected prefetch projection", () => {
  it("passes false only for the requested private destination; existing defaults remain", () => {
    const html = renderToStaticMarkup(<NavigationList groups={[{ id: "reports-info", label: "ข่าวสารและความรู้", workspace: "personal", items: [
      { href: "/app/personal/wellness", label: "อาหารและออกกำลังกาย", match: "prefix" },
      { href: "/app/personal/knowledge", label: "สื่อความรู้", match: "prefix", prefetch: false },
    ] }]} />);
    expect(html).toMatch(/<a(?=[^>]*href="\/app\/personal\/knowledge")(?=[^>]*data-prefetch="false")(?=[^>]*aria-current="page")[^>]*>/u);
    expect(html).toMatch(/<a(?=[^>]*href="\/app\/personal\/wellness")(?=[^>]*data-prefetch="undefined")[^>]*>/u);
  });

  it("hides Work sections in Personal and keeps the navigate hook", () => {
    const html = renderToStaticMarkup(<NavigationList onNavigate={() => {}} tone="mobile" groups={[
      { id: "reports-info", label: "ข่าวสารและความรู้", workspace: "personal", items: [{ href: "/app/personal/knowledge", label: "สื่อความรู้", match: "prefix" }] },
      ...workGroups,
    ]} />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toContain("บุคลากร");
    expect(html).toContain('data-on-navigate="true"');
  });

  it("announces a pending navigation on the clicked link only while it is pending", () => {
    const groups: ApplicationNavigationGroup[] = [{ id: "reports-info", label: "ข่าวสารและความรู้", workspace: "personal", items: [
      { href: "/app/personal/knowledge", label: "สื่อความรู้", match: "prefix", prefetch: false },
    ] }];
    expect(renderToStaticMarkup(<NavigationList groups={groups} />)).not.toContain("กำลังเปิดหน้า");
    linkStatus.pending = true;
    try {
      const html = renderToStaticMarkup(<NavigationList groups={groups} />);
      expect(html).toContain('<span class="sr-only">กำลังเปิดหน้า</span>');
      expect(html).toContain('aria-hidden="true"');
    } finally {
      linkStatus.pending = false;
    }
  });
});

describe("UI-4 task sections and icon rail", () => {
  it("renders sections in the fixed taxonomy order with headings labelling their lists", () => {
    location.pathname = "/app";
    try {
      const html = renderToStaticMarkup(<NavigationList groups={workGroups} />);
      expect(html.indexOf('href="/app"')).toBeLessThan(html.indexOf("ดูแลผู้ป่วย"));
      expect(html.indexOf("ดูแลผู้ป่วย")).toBeLessThan(html.indexOf("บริหารโรงพยาบาล"));
      expect(html).toContain('id="navigation-section-desktop-care"');
      expect(html).toContain('aria-labelledby="navigation-section-desktop-care"');
      expect(html.match(/<svg aria-hidden="true"/g)).toHaveLength(4);
    } finally {
      location.pathname = "/app/personal/knowledge";
    }
  });

  it("marks the OSM task item, not its parent, as the current page", () => {
    location.pathname = "/app/patients/assigned";
    location.search = "task=screening";
    try {
      const html = renderToStaticMarkup(<NavigationList groups={workGroups} />);
      expect(html).toMatch(/<a(?=[^>]*href="\/app\/patients\/assigned\?task=screening")(?=[^>]*aria-current="page")[^>]*>/u);
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    } finally {
      location.pathname = "/app/personal/knowledge";
      location.search = "";
    }
  });

  it("keeps every item reachable in the collapsed rail with a name and a tooltip source", () => {
    const html = renderToStaticMarkup(<NavigationList collapsed groups={workGroups} />);
    const links = html.match(/<a\b[^>]*>/gu) ?? [];

    expect(links).toHaveLength(4);
    for (const label of ["หน้าหลัก", "รอคัดกรอง", "บุคลากร"]) {
      expect(html).toContain(`aria-label="${label}"`);
      expect(html).toContain(`data-navigation-tooltip="${label}"`);
    }
    expect(html).toContain('data-navigation-tooltip="ผู้ป่วยที่ดูแล"');
    expect(html).toContain('aria-label="ผู้ป่วยที่ดูแล · รอรับนัด 4 รายการ"');
    expect(html).toContain(">4</span>");
    // Headings stay for screen readers only; nothing in the rail is inert, hidden or removed from the tab order.
    expect(html).toContain('class="sr-only text-white/55" id="navigation-section-desktop-care"');
    expect(html).not.toMatch(/inert|aria-hidden="true"[^>]*href|tabindex="-1"/u);
  });
});
