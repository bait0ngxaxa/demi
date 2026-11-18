// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MobileNavigationGlyph } from "@/components/app-shell/mobile-navigation-glyph";
import { HomeHospitalChip } from "./home-hospital-chip";

function renderChip(props: React.ComponentProps<typeof HomeHospitalChip>): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<HomeHospitalChip {...props} />);
  expect(root.innerHTML).not.toMatch(/bg-brand-deep|text-white|ring-brand-bright/u);
  return root;
}

const context = { action: "/app", fieldName: "hospitalId", selectId: "work-home-hospital" };

describe("HomeHospitalChip", () => {
  it.each(["โรงพยาบาลเดมิทดสอบ", "รพ.สต. บ้านใหม่", "ศูนย์สุขภาพชุมชน"])("renders %s verbatim as text with a decorative hospital glyph", (name) => {
    const root = renderChip({ ...context, groups: [{ label: null, options: [{ value: "h1", label: name }] }], selectedValue: "h1", selectedLabel: name });

    expect(root.textContent).toBe(name);
    expect(root.querySelector("p")?.hasAttribute("aria-label")).toBe(false);
    expect(root.querySelector("p")?.classList).toContain("rounded-pill");
    expect(root.querySelector("form, select, button")).toBeNull();
    expect(root.querySelector("svg")?.outerHTML).toBe(renderToStaticMarkup(<MobileNavigationGlyph icon="hospital" />));
    expect(root.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each([
    context,
    { action: "/app/personal", fieldName: "hospital", selectId: "personal-home-hospital" },
    { action: "/app/personal/health", fieldName: "relationshipId", selectId: "health-hospital" },
  ])("preserves grouped selection and submitted values for $fieldName", (selector) => {
    const root = renderChip({
      ...selector,
      groups: [
        { label: "เครือข่ายเดมิ", options: [{ value: "id-1", label: "โรงพยาบาลเดมิทดสอบ" }] },
        { label: null, options: [{ value: "id-2", label: "รพ.สต. บ้านใหม่" }] },
      ],
      selectedValue: "id-2",
      selectedLabel: "รพ.สต. บ้านใหม่",
    });
    const form = root.querySelector("form");
    const select = root.querySelector("select");
    if (!form || !select) throw new Error("Expected a hospital selection form");

    expect(form.getAttribute("action")).toBe(selector.action);
    expect(form.method).toBe("get");
    expect(select.labels?.[0]?.textContent).toBe("โรงพยาบาลปัจจุบัน");
    expect(select.classList).toContain("rounded-pill");
    expect(select.classList).toContain("min-h-11");
    expect(select.classList).toContain("focus-visible:ring-offset-header-surface");
    expect(select.querySelector("optgroup")?.label).toBe("เครือข่ายเดมิ");
    expect([...select.options].map(({ value, text }) => [value, text])).toEqual([
      ["id-1", "โรงพยาบาลเดมิทดสอบ"], ["id-2", "รพ.สต. บ้านใหม่"],
    ]);
    expect(new FormData(form).get(selector.fieldName)).toBe("id-2");
    select.value = "id-1";
    expect(new FormData(form).get(selector.fieldName)).toBe("id-1");
    expect(form.querySelector('button[type="submit"]')?.textContent).toBe("เปลี่ยน");
  });

  it.each([
    [null, null, undefined, "ยังไม่มีโรงพยาบาลที่พร้อมใช้งาน"],
    [null, null, "ระบบ DEMI ทั้งหมด", "ระบบ DEMI ทั้งหมด"],
    ["id-1", null, undefined, "ยังไม่มีโรงพยาบาลที่พร้อมใช้งาน"],
    [null, "ชื่อโรงพยาบาล", undefined, "ยังไม่มีโรงพยาบาลที่พร้อมใช้งาน"],
  ] as const)("shows plain fallback text when context is missing (%s, %s)", (selectedValue, selectedLabel, emptyLabel, expected) => {
    const root = renderChip({ ...context, groups: [], selectedValue, selectedLabel, emptyLabel });

    expect(root.textContent).toBe(expected);
    expect(root.querySelector("p")?.classList).toContain("text-header-muted");
    expect(root.querySelector("svg, form, select, button")).toBeNull();
  });
});
