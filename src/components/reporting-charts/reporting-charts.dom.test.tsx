// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { countValue } from "./chart-value";
import { CountBarChart } from "./count-bar-chart";
import { ProgramStatusDonut } from "./program-status-donut";

const CHART_WIDTH = 480;

// jsdom has no layout; report a fixed content box so ResponsiveContainer draws its chart.
class FixedSizeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    const height = Number.parseFloat((target as HTMLElement).style.height) || 200;
    this.callback([{ target, contentRect: { width: CHART_WIDTH, height } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FixedSizeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    { width: CHART_WIDTH, height: 200, top: 0, left: 0, right: CHART_WIDTH, bottom: 200, x: 0, y: 0, toJSON: () => ({}) },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reporting charts in the browser", () => {
  it("draws one bar per count with direct value labels inside a hidden, non-focusable chart", () => {
    act(() => root.render(createElement(CountBarChart, {
      headingId: "bars", title: "กราฟ", description: "คำอธิบาย", emptyMessage: "ว่าง", listLabel: "รายการ", scaleMax: 10,
      categories: [
        { key: "r", axisLabel: "Routine", label: "Program ที่มีบันทึก Routine", value: countValue(4) },
        { key: "f", axisLabel: "Floating Chart", label: "Program ที่มีบันทึก Floating Chart", value: countValue(2) },
        { key: "u", axisLabel: "ไม่พร้อม", label: "ค่าที่ไม่พร้อม", value: { state: "UNAVAILABLE" } },
      ],
    })));

    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden?.querySelectorAll("svg").length).toBeGreaterThan(0);
    expect(hidden?.querySelectorAll(".recharts-bar-rectangle").length).toBe(2);
    // Every counted category keeps its axis label (long labels wrap instead of being dropped).
    expect(hidden?.querySelectorAll(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value").length).toBe(2);
    expect(hidden?.textContent).toContain("Routine");
    expect(hidden?.textContent).not.toContain("ไม่พร้อม");
    // The drawn chart offers no focus stop; the text list carries the values for keyboard users.
    expect([...container.querySelectorAll("svg[tabindex], svg [tabindex]")]
      .filter((element) => Number(element.getAttribute("tabindex")) >= 0)).toHaveLength(0);
    expect(container.querySelector('ul[aria-label="รายการ"]')?.textContent).toContain("ยังไม่พร้อมใช้งาน");
  });

  it("draws one donut sector per status with token colours", () => {
    act(() => root.render(createElement(ProgramStatusDonut, { headingId: "status", active: 5, completed: 2 })));

    const sectors = [...container.querySelectorAll(".recharts-pie-sector path")];
    expect(sectors.map((sector) => sector.getAttribute("fill"))).toEqual(["var(--brand)", "var(--brand-muted)"]);
    expect(container.textContent).toContain("Program ทั้งหมด");
  });
});
