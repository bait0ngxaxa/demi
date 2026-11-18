// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./page-header";

function renderHeader(props: React.ComponentProps<typeof PageHeader>): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<PageHeader {...props} />);
  return root;
}

describe("PageHeader", () => {
  it("renders one heading, its description and context in the tinted panel", () => {
    const root = renderHeader({
      title: "ข้อมูลสุขภาพ",
      description: "สรุปข้อมูลจากโรงพยาบาลที่เลือก",
      context: <span>โรงพยาบาลเดมิ</span>,
    });
    const header = root.querySelector("header");
    expect(header?.classList).toContain("bg-header-surface");
    expect(header?.classList).toContain("pt-5");
    expect(header?.querySelectorAll("h1")).toHaveLength(1);
    expect(header?.querySelector("h1")?.textContent).toBe("ข้อมูลสุขภาพ");
    expect(header?.querySelector("p")?.textContent).toBe("สรุปข้อมูลจากโรงพยาบาลที่เลือก");
    expect(header?.querySelector("p + div")?.textContent).toBe("โรงพยาบาลเดมิ");
    expect(header?.querySelector("nav")).toBeNull();
  });

  it("shows the last linked breadcrumb on mobile and the full ordered trail on desktop", () => {
    const breadcrumbs = [
      { label: "พื้นที่ทำงาน", href: "/app" },
      { label: "รายชื่อผู้ป่วย", href: "/app/patients?hospitalId=H" },
      { label: "รายละเอียดผู้ป่วย" },
    ];
    const root = renderHeader({ title: "รายละเอียดผู้ป่วย", breadcrumbs });
    const nav = root.querySelector('nav[aria-label="ลำดับหน้า"]');
    const back = nav?.querySelector(":scope > a");
    expect(back?.classList).toContain("lg:hidden");
    expect(back?.classList).toContain("min-h-11");
    expect(back?.textContent).toBe(breadcrumbs[1].label);
    expect(back?.getAttribute("href")).toBe(breadcrumbs[1].href);
    expect(back?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    const trail = nav?.querySelector("ol");
    expect(trail?.classList).toContain("hidden");
    expect(trail?.classList).toContain("lg:flex");
    expect(Array.from(trail?.querySelectorAll("li") ?? [], (item) => item.textContent?.replace(/^\//u, "")))
      .toEqual(breadcrumbs.map(({ label }) => label));
    expect(trail?.querySelector('[aria-current="page"]')?.textContent).toBe(breadcrumbs[2].label);
  });

  it("does not mark a linked parent breadcrumb as the current page", () => {
    const root = renderHeader({
      title: "รายละเอียดข่าวสาร",
      breadcrumbs: [{ label: "ข่าวสารและความรู้", href: "/app/hospitals/knowledge" }],
    });

    const desktopLink = root.querySelector("nav ol a");
    expect(desktopLink?.getAttribute("href")).toBe("/app/hospitals/knowledge");
    expect(root.querySelector("nav a[aria-current]")).toBeNull();
  });
});
